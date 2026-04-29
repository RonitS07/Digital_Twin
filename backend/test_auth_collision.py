import requests

URL = "http://127.0.0.1:8000/auth/firebase"
PAYLOAD = {
    "uid": "new_uid_colliding_email",
    "email": "ronitshah1124@gmail.com", # Already exists for IgFSlzdsiDS0DGycuktRWFzhKwo2
    "name": "Colliding User"
}

res = requests.post(URL, json=PAYLOAD)
print(f"Status: {res.status_code}, Body: {res.json()}")
