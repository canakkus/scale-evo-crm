import sys
import json
import time
from urllib.parse import quote, urlparse
from scrapling import Fetcher

def fetch_treatwell(url):
    fetcher = Fetcher(stealth=True, auto_match=False)
    page = fetcher.get(url)
    
    # Extract JSON-LD
    results = []
    scripts = page.css('script[type="application/ld+json"]')
    for script in scripts:
        try:
            data = json.loads(script.text)
            if "itemListElement" in data:
                results.append(data)
        except:
            pass
    return {"html": page.text, "json_ld": results, "url": page.url}

def fetch_websearch(query):
    # DuckDuckGo search
    fetcher = Fetcher(stealth=True, auto_match=False)
    url = f"https://html.duckduckgo.com/html/?q={quote(query)}"
    page = fetcher.get(url)
    
    links = []
    for result in page.css('.result'):
        link_el = result.css('.result__a')
        if link_el:
            title = link_el[0].text
            href = link_el[0].attrib.get('href', '')
            links.append({"title": title.strip(), "href": href})
            
    # Bing fallback if DDG fails or is empty
    if not links:
        url_bing = f"https://www.bing.com/search?q={quote(query)}&count=10&setlang=de"
        page_bing = fetcher.get(url_bing)
        for result in page_bing.css('li.b_algo h2 a, h2 a, a[href^="http"]'):
            href = result.attrib.get('href', '')
            title = result.text
            if href and title:
                links.append({"title": title.strip(), "href": href})
                
    return {"links": links}

def fetch_html(url):
    fetcher = Fetcher(stealth=True, auto_match=False)
    # Some pages might need more timeout or different headers, but Fetcher handles stealth
    try:
        page = fetcher.get(url)
        return {
            "html": page.text,
            "status": page.status,
            "url": page.url,
            "headers": dict(page.headers)
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        action = input_data.get("action")
        payload = input_data.get("payload")
        
        if action == "treatwell":
            res = fetch_treatwell(payload.get("url"))
            print(json.dumps(res))
        elif action == "websearch":
            res = fetch_websearch(payload.get("query"))
            print(json.dumps(res))
        elif action == "fetch_html":
            res = fetch_html(payload.get("url"))
            print(json.dumps(res))
        else:
            print(json.dumps({"error": "unknown action"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
