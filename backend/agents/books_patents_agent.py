"""
Module 6: Books and Patents Verification
- OpenLibrary API  for ISBN-based book verification
- USPTO PatentsView API for patent number verification
"""
import asyncio
import aiohttp
from backend.schemas.research import Book, Patent
from backend.cache.cache_manager import cache

OPENLIBRARY_URL  = "https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data"
PATENTSVIEW_URL  = "https://api.patentsview.org/patents/query"


async def verify_book(book: Book) -> Book:
    if not book.isbn:
        return book

    isbn_clean = book.isbn.replace("-", "").replace(" ", "")
    cached = cache.get("book", {"isbn": isbn_clean})
    if cached:
        book.is_verified         = cached.get("is_verified", False)
        book.verification_source = cached.get("verification_source")
        return book

    try:
        async with aiohttp.ClientSession() as session:
            url = OPENLIBRARY_URL.format(isbn=isbn_clean)
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
                if r.status == 200:
                    data = await r.json()
                    if data:
                        book.is_verified         = True
                        book.verification_source = "OpenLibrary"
                        info = list(data.values())[0]
                        if not book.publisher and info.get("publishers"):
                            book.publisher = info["publishers"][0].get("name")
                        if not book.online_link:
                            book.online_link = f"https://openlibrary.org/isbn/{isbn_clean}"
    except Exception:
        pass

    cache.set("book", {"isbn": isbn_clean},
              {"is_verified": book.is_verified, "verification_source": book.verification_source},
              ttl_days=180)
    return book


async def verify_patent(patent: Patent) -> Patent:
    if not patent.patent_number:
        return patent

    num_clean = patent.patent_number.replace(" ", "").replace("-", "")
    cached = cache.get("patent", {"number": num_clean})
    if cached:
        patent.is_verified         = cached.get("is_verified", False)
        patent.verification_source = cached.get("verification_source")
        return patent

    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "q": {"patent_number": num_clean},
                "f": ["patent_number", "patent_title", "patent_date", "inventor_last_name"],
                "o": {"per_page": 1},
            }
            async with session.post(PATENTSVIEW_URL, json=payload,
                                    timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status == 200:
                    data = await r.json()
                    if data.get("patents"):
                        patent.is_verified         = True
                        patent.verification_source = "USPTO PatentsView"
                        p = data["patents"][0]
                        if not patent.date:
                            patent.date = p.get("patent_date")
    except Exception:
        pass

    cache.set("patent", {"number": num_clean},
              {"is_verified": patent.is_verified, "verification_source": patent.verification_source},
              ttl_days=365)
    return patent


async def run(books: list[Book], patents: list[Patent]) -> tuple[list[Book], list[Patent]]:
    verified_books   = list(await asyncio.gather(*[verify_book(b)    for b in books]))   if books   else []
    verified_patents = list(await asyncio.gather(*[verify_patent(p)  for p in patents])) if patents else []
    return verified_books, verified_patents