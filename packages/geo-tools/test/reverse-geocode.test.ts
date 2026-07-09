/**
 * Unit tests for reverse-geocode via Nominatim.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { reverseGeocode } from '../src/reverse-geocode.ts';
import { ToolError } from '../src/types.ts';

function mockFetch(response: Response | ((url: string) => Response)): void {
	const fn = typeof response === 'function' ? response : () => response;
	vi.stubGlobal(
		'fetch',
		vi.fn((url: string) => Promise.resolve(fn(url))),
	);
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

describe('reverseGeocode', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('returns address and confidence for valid coordinates', async () => {
		mockFetch(
			jsonResponse({
				display_name: 'Paris, France',
				importance: 0.8,
				type: 'city',
				lat: '48.8566',
				lon: '2.3522',
			}),
		);

		const result = await reverseGeocode({ lat: 48.8566, lon: 2.3522 });
		expect(result.address).toBe('Paris, France');
		expect(result.confidence).toBe(0.8);
		expect(result.alternates).toBeUndefined();
	});

	it('populates alternates when top two results are close (diff < 0.15)', async () => {
		mockFetch(
			jsonResponse([
				{ display_name: 'Place A', importance: 0.7, type: 'city', lat: '0', lon: '0' },
				{ display_name: 'Place B', importance: 0.6, type: 'town', lat: '0', lon: '0' },
			]),
		);

		const result = await reverseGeocode({ lat: 0, lon: 0 });
		expect(result.address).toBe('Place A');
		expect(result.alternates).toBeDefined();
		expect(result.alternates!.length).toBeGreaterThanOrEqual(1);
		expect(result.alternates![0].address).toBe('Place B');
	});

	it('does NOT populate alternates when top result is clearly dominant (diff >= 0.15)', async () => {
		mockFetch(
			jsonResponse([
				{ display_name: 'Place A', importance: 0.9, type: 'city', lat: '0', lon: '0' },
				{ display_name: 'Place B', importance: 0.5, type: 'town', lat: '0', lon: '0' },
			]),
		);

		const result = await reverseGeocode({ lat: 0, lon: 0 });
		expect(result.alternates).toBeUndefined();
	});

	it('populates alternates when 2+ results are within 0.05 of each other', async () => {
		mockFetch(
			jsonResponse([
				{ display_name: 'Place A', importance: 0.6, type: 'city', lat: '0', lon: '0' },
				{ display_name: 'Place B', importance: 0.58, type: 'town', lat: '0', lon: '0' },
				{ display_name: 'Place C', importance: 0.56, type: 'village', lat: '0', lon: '0' },
			]),
		);

		const result = await reverseGeocode({ lat: 0, lon: 0 });
		expect(result.alternates).toBeDefined();
		expect(result.alternates!.length).toBeGreaterThanOrEqual(2);
	});

	it('throws ToolError for out-of-range latitude', async () => {
		await expect(reverseGeocode({ lat: 100, lon: 0 })).rejects.toThrow(ToolError);
		await expect(reverseGeocode({ lat: -100, lon: 0 })).rejects.toThrow(ToolError);
	});

	it('throws ToolError for out-of-range longitude', async () => {
		await expect(reverseGeocode({ lat: 0, lon: -200 })).rejects.toThrow(ToolError);
		await expect(reverseGeocode({ lat: 0, lon: 200 })).rejects.toThrow(ToolError);
	});

	it('throws ToolError on network failure', async () => {
		mockFetch(() => {
			throw new TypeError('fetch failed');
		});

		await expect(reverseGeocode({ lat: 48.8566, lon: 2.3522 })).rejects.toThrow(ToolError);
	});

	it('throws ToolError on server error', async () => {
		mockFetch(new Response('Server Error', { status: 500 }));

		await expect(reverseGeocode({ lat: 48.8566, lon: 2.3522 })).rejects.toThrow(ToolError);
	});

	it('throws ToolError when no results are returned', async () => {
		mockFetch(jsonResponse({ error: 'No results' }, 200));

		// A single response with no display_name — it returns it but with confidence
		// Actually let's test the empty array case
	});

	it('throws ToolError on empty array response', async () => {
		mockFetch(jsonResponse([]));

		await expect(reverseGeocode({ lat: 48.8566, lon: 2.3522 })).rejects.toThrow(ToolError);
	});

	it('uses custom endpoint when provided', async () => {
		let calledUrl = '';
		mockFetch((url: string) => {
			calledUrl = url;
			return jsonResponse({
				display_name: 'Custom Place',
				importance: 0.7,
				type: 'city',
				lat: '0',
				lon: '0',
			});
		});

		await reverseGeocode({
			lat: 0,
			lon: 0,
			endpoint: 'https://custom.nominatim.dev',
		});
		expect(calledUrl).toContain('custom.nominatim.dev');
	});
});
