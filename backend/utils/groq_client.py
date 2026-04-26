"""
Groq client with automatic API key rotation.

Handles both rate limits (429) and invalid keys (401) by rotating to the next key.
Keys that give 401 are permanently removed from the pool for that session.

Usage:
    from backend.utils.groq_client import groq_chat
    response = await groq_chat(model=..., messages=..., temperature=..., max_tokens=...)
    text = response.choices[0].message.content
"""
import asyncio
from groq import AsyncGroq, RateLimitError, AuthenticationError
from backend.config import settings


def _build_key_pool() -> list[str]:
    pool = []
    if settings.groq_api_keys:
        pool = [k.strip() for k in settings.groq_api_keys.split(",") if k.strip()]
    if settings.groq_api_key and settings.groq_api_key not in pool:
        pool.append(settings.groq_api_key)
    return pool


_key_pool  = _build_key_pool()
_key_index = 0
_clients: dict[str, AsyncGroq] = {}
_bad_keys: set[str] = set()   # keys that returned 401 — skip permanently

if _key_pool:
    print(f"[groq_client] {len(_key_pool)} API key(s) loaded.")
else:
    print("[groq_client] WARNING: No Groq API keys found. Set GROQ_API_KEY in .env")


def _get_client(key: str) -> AsyncGroq:
    if key not in _clients:
        _clients[key] = AsyncGroq(api_key=key)
    return _clients[key]


def _active_keys() -> list[str]:
    return [k for k in _key_pool if k not in _bad_keys]


async def groq_chat(
    model: str,
    messages: list[dict],
    temperature: float = 0.1,
    max_tokens: int = 1500,
    response_format: dict | None = None,
    retries: int = 3,
) -> object:
    global _key_index

    active = _active_keys()
    if not active:
        raise ValueError(
            "No valid Groq API keys available. "
            "Check GROQ_API_KEY in .env or go to console.groq.com to generate a new key."
        )

    last_error = None

    for attempt in range(retries * len(active)):
        active = _active_keys()
        if not active:
            break

        key    = active[_key_index % len(active)]
        client = _get_client(key)

        try:
            kwargs = dict(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if response_format:
                kwargs["response_format"] = response_format

            return await client.chat.completions.create(**kwargs)

        except AuthenticationError as e:
            # Key is invalid — remove it and try next one immediately
            print(f"[groq_client] Key ending ...{key[-6:]} is invalid (401). "
                  f"Removing from pool. {len(_active_keys()) - 1} key(s) remaining.")
            _bad_keys.add(key)
            _key_index += 1
            last_error = e
            # No sleep — invalid key is useless, move on immediately

        except RateLimitError as e:
            # Key hit rate limit — rotate and wait
            _key_index += 1
            wait = min(2 ** (attempt % 4), 16)
            active = _active_keys()
            print(f"[groq_client] Rate limit hit. Rotating to next key. "
                  f"Waiting {wait}s… ({len(active)} key(s) available)")
            await asyncio.sleep(wait)
            last_error = e

        except Exception as e:
            raise e

    if not _active_keys():
        raise ValueError(
            "All Groq API keys are invalid. "
            "Generate a new key at console.groq.com and update GROQ_API_KEY in .env"
        )

    raise last_error or RuntimeError("All Groq API keys exhausted.")