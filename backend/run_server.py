import uvicorn
from finance_server.main import app

if __name__ == "__main__":
    # Port 8112 is used in the root package.json start script
    uvicorn.run(app, host="127.0.0.1", port=8112)
