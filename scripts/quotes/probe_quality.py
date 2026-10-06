#!/usr/bin/env python3
"""Classify existing quote probe payload without logging price/body/provider details."""
import json, math, sys
EXPECTED = ('600519.SH', 'AAPL')
PREFERRED = 'datagateway-wind'
LIMIT = 2 * 1024 * 1024

def classify(payload):
    invalid = {'availability': 'invalid', 'preferred_source': 'unknown', 'reason': 'invalid_payload'}
    if not isinstance(payload, dict): return invalid
    quotes, meta = payload.get('quotes'), payload.get('meta')
    if not isinstance(quotes, dict) or not isinstance(meta, dict): return invalid
    failed, stale = meta.get('failed'), meta.get('stale')
    if type(failed) is not int or type(stale) is not int or not 0 <= failed <= len(EXPECTED) or not 0 <= stale <= len(EXPECTED): return invalid
    usable = []
    for ticker in EXPECTED:
        quote = quotes.get(ticker)
        price = quote.get('price') if isinstance(quote, dict) else None
        try:
            usable.append(type(price) in (int, float) and math.isfinite(price) and price > 0)
        except OverflowError:
            usable.append(False)
    delayed = any(isinstance(quotes.get(t), dict) and quotes[t].get('delayed') is True for t in EXPECTED)
    selected = meta.get('selected_sources')
    if not isinstance(selected, dict) or any(not isinstance(selected.get(t), str) or not selected[t] for t in EXPECTED):
        preferred = 'unknown'
    else:
        if any(not isinstance(quotes.get(t), dict) or not isinstance(quotes[t].get('source'), str) or not quotes[t]['source'] for t in EXPECTED):
            preferred = 'unknown'
        else:
            preferred = 'selected' if all(selected[t] == PREFERRED and quotes[t]['source'] == PREFERRED for t in EXPECTED) else 'degraded'
    if failed or not all(usable): availability = 'unavailable'
    elif stale or delayed: availability = 'stale'
    else: availability = 'available'
    return {'availability': availability, 'preferred_source': preferred, 'reason': 'classified'}

def main():
    raw = sys.stdin.buffer.read(LIMIT + 1)
    try:
        if len(raw) > LIMIT: raise ValueError('overflow')
        result = classify(json.loads(raw))
    except (ValueError, UnicodeDecodeError, RecursionError):
        result = {'availability': 'invalid', 'preferred_source': 'unknown', 'reason': 'invalid_payload'}
    print(json.dumps(result, sort_keys=True))
    return 0 if result['availability'] == 'available' and result['preferred_source'] == 'selected' else 1

if __name__ == '__main__': sys.exit(main())
