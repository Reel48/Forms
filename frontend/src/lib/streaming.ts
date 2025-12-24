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
		if (data.startsWith('[DONE]')) {
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

