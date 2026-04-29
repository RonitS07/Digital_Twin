import requests
import threading

URL = "http://127.0.0.1:8000/auth/firebase"
PAYLOAD = {
    "uid": "test_race_user",
    "email": "race@test.com",
    "name": "Race User"
}

def hit_auth():
    try:
        res = requests.post(URL, json=PAYLOAD)
        print(f"Status: {res.status_code}, Body: {res.json()}")
    except Exception as e:
        print(f"Error: {e}")

threads = []
for i in range(5):
    t = threading.Thread(target=hit_auth)
    threads.append(t)

for t in threads:
    t.start()
for t in threads:
    t.join()
