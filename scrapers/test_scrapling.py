import sys
try:
    from scrapling import Fetcher
    
    fetcher = Fetcher(auto_match=False) # Wait, let's just see what properties are in scrapling
    print(dir(fetcher))
except Exception as e:
    import traceback
    traceback.print_exc()
