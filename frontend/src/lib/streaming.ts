import { EventSourceParserStream } from 'eventsource-parser/stream';
import type { ParsedEvent } from 'eventsource-parser';

export type TextStreamUpdate = {
	done: boolean;
	value: string;
	error?: any;
	usage?: ResponseUsage;
};

export type ResponseUsage = {
	/** Including images and tools if any */
	prompt_tokens: number;
	/** The tokens generated */
	completion_tokens: number;
	/** Sum of the above two fields */
	total_tokens: number;
	/** Any other fields that aren't part of the base OpenAI spec */
	[other: string]: unknown;
};

// createTextStream takes a responseBody with a SSE response,
// and returns an async generator that emits delta updates with large deltas chunked into random sized chunks
export async function createTextStream(
	responseBody: ReadableStream<Uint8Array>,
	splitLargeDeltas: boolean = true
): Promise<AsyncGenerator<TextStreamUpdate>> {
	// Decode and parse the stream
	const decoder = new TextDecoderStream();
	const eventStream = responseBody
		.pipeThrough(decoder as any)
		.pipeThrough(new EventSourceParserStream())
		.getReader();
	
	let iterator = streamToIterator(eventStream);
	if (splitLargeDeltas) {
		iterator = streamLargeDeltasAsRandomChunks(iterator);
	}
	return iterator;
}

async function* streamToIterator(
	reader: ReadableStreamDefaultReader<ParsedEvent>
): AsyncGenerator<TextStreamUpdate> {
	while (true) {
		const { value, done } = await reader.read();
		if (done) {
			yield { done: true, value: '' };
			break;
		}
		if (!value) {
			continue;
		}
		
		const data = value.data;
		if (!data) {
			continue;
		}
		
		if (data.startsWith('[DONE]')) {
			yield { done: true, value: '' };
			break;
		}

		try {
			const parsedData = JSON.parse(data);

			if (parsedData.error) {
				console.error('[STREAMING PARSER] Error in stream:', parsedData.error);
				yield { done: true, value: '', error: parsedData.error };
				break;
			}

			if (parsedData.usage) {
				yield { done: false, value: '', usage: parsedData.usage };
				continue;
			}

			// Support both OpenAI-style (delta.content) and our custom format (delta or value)
			const deltaContent = parsedData.choices?.[0]?.delta?.content ?? parsedData.delta ?? parsedData.value ?? '';
			
			yield {
				done: false,
				value: deltaContent
			};
		} catch (e) {
			console.error('[STREAMING PARSER] Error extracting delta from SSE event:', e, 'Raw data:', data);
		}
	}
}

// streamLargeDeltasAsRandomChunks will chunk large deltas (length > 5) into random sized chunks between 1-3 characters
// This is to simulate a more fluid streaming, even though some providers may send large chunks of text at once
async function* streamLargeDeltasAsRandomChunks(
	iterator: AsyncGenerator<TextStreamUpdate>
): AsyncGenerator<TextStreamUpdate> {
	for await (const textStreamUpdate of iterator) {
		if (textStreamUpdate.done) {
			yield textStreamUpdate;
			return;
		}

		if (textStreamUpdate.error) {
			yield textStreamUpdate;
			continue;
		}
		if (textStreamUpdate.usage) {
			yield textStreamUpdate;
			continue;
		}

		let content = textStreamUpdate.value;
		if (content.length < 5) {
			yield { done: false, value: content };
			continue;
		}
		while (content != '') {
			const chunkSize = Math.min(Math.floor(Math.random() * 3) + 1, content.length);
			const chunk = content.slice(0, chunkSize);
			yield { done: false, value: chunk };
			// Do not sleep if the tab is hidden
			// Timers are throttled to 1s in hidden tabs
			if (document?.visibilityState !== 'hidden') {
				await sleep(5);
			}
			content = content.slice(chunkSize);
		}
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Manual SSE parser as fallback if EventSourceParserStream fails
export async function* manualSSEParser(
	responseBody: ReadableStream<Uint8Array>
): AsyncGenerator<TextStreamUpdate> {
	console.log('[STREAMING PARSER] Using manual SSE parser');
	const reader = responseBody.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				console.log('[STREAMING PARSER] Manual parser: stream ended');
				break;
			}
			
			// Decode chunk and add to buffer
			buffer += decoder.decode(value, { stream: true });
			
			// Process complete SSE events (separated by \n\n)
			while (buffer.includes('\n\n')) {
				const eventEnd = buffer.indexOf('\n\n');
				const eventText = buffer.substring(0, eventEnd);
				buffer = buffer.substring(eventEnd + 2);
				
				// Parse SSE event
				if (eventText.startsWith('data: ')) {
					const data = eventText.substring(6); // Remove "data: " prefix
					
					if (data === '[DONE]') {
						console.log('[STREAMING PARSER] Manual parser: [DONE] received');
						yield { done: true, value: '' };
						return;
					}
					
					try {
						const parsedData = JSON.parse(data);
						console.log('[STREAMING PARSER] Manual parser: parsed data:', parsedData);
						
						if (parsedData.error) {
							yield { done: true, value: '', error: parsedData.error };
							return;
						}
						
						const deltaContent = parsedData.delta ?? parsedData.value ?? '';
						if (deltaContent) {
							console.log('[STREAMING PARSER] Manual parser: extracted delta:', deltaContent.substring(0, 50));
							yield { done: false, value: deltaContent };
						}
					} catch (e) {
						console.error('[STREAMING PARSER] Manual parser: JSON parse error:', e, 'Data:', data);
					}
				}
			}
		}
	} catch (error) {
		console.error('[STREAMING PARSER] Manual parser error:', error);
		yield { done: true, value: '', error };
	} finally {
		reader.releaseLock();
	}
}

