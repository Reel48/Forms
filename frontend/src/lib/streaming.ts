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
	console.log('[STREAMING PARSER] Creating text stream from ReadableStream');
	
	// Create a logging wrapper to see raw bytes before parsing
	// This passes through raw bytes and logs the decoded text for debugging
	const loggedStream = new ReadableStream({
		start(controller) {
			const reader = responseBody.getReader();
			const decoder = new TextDecoder();
			let chunkCount = 0;
			let totalBytes = 0;
			
			function pump(): Promise<void> {
				return reader.read().then(({ done, value }) => {
					if (done) {
						console.log('[STREAMING PARSER] Raw stream ended. Total raw chunks:', chunkCount, 'Total bytes:', totalBytes);
						controller.close();
						return;
					}
					
					chunkCount++;
					totalBytes += value.length;
					// Decode for logging only (don't modify the stream)
					const text = decoder.decode(value, { stream: true });
					console.log(`[STREAMING PARSER] Raw chunk ${chunkCount} (${value.length} bytes):`, 
						text.substring(0, 150).replace(/\n/g, '\\n'), 
						text.length > 150 ? '...' : '',
						'(text length:', text.length, ')');
					
					// Pass through the raw bytes unchanged
					controller.enqueue(value);
					return pump();
				}).catch((error) => {
					console.error('[STREAMING PARSER] Error in logged stream:', error);
					controller.error(error);
				});
			}
			
			return pump();
		}
	});
	
	// Now decode and parse the logged stream
	const decoder = new TextDecoderStream();
	const eventStream = loggedStream
		.pipeThrough(decoder as any)
		.pipeThrough(new EventSourceParserStream())
		.getReader();
	
	console.log('[STREAMING PARSER] EventSourceParserStream created, starting to read events');
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
			console.log('[STREAMING PARSER] Received null/undefined value');
			continue;
		}
		
		console.log('[STREAMING PARSER] Received event:', {
			type: value.type,
			data: value.data?.substring(0, 200),
			dataLength: value.data?.length,
			hasData: !!value.data
		});
		
		const data = value.data;
		if (!data) {
			console.log('[STREAMING PARSER] Event has no data field');
			continue;
		}
		
		if (data.startsWith('[DONE]')) {
			console.log('[STREAMING PARSER] Received [DONE] signal');
			yield { done: true, value: '' };
			break;
		}

		try {
			const parsedData = JSON.parse(data);
			console.log('[STREAMING PARSER] Parsed SSE data:', parsedData);

			if (parsedData.error) {
				console.error('[STREAMING PARSER] Error in stream:', parsedData.error);
				yield { done: true, value: '', error: parsedData.error };
				break;
			}

			if (parsedData.usage) {
				console.log('[STREAMING PARSER] Usage info received:', parsedData.usage);
				yield { done: false, value: '', usage: parsedData.usage };
				continue;
			}

			// Support both OpenAI-style (delta.content) and our custom format (delta or value)
			const deltaContent = parsedData.choices?.[0]?.delta?.content ?? parsedData.delta ?? parsedData.value ?? '';
			console.log('[STREAMING PARSER] Extracted delta content:', {
				hasChoices: !!parsedData.choices,
				hasDelta: !!parsedData.delta,
				hasValue: !!parsedData.value,
				deltaContent: deltaContent,
				deltaLength: deltaContent.length
			});
			
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

