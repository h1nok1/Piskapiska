import cv2
import numpy as np
import mediapipe as mp
import base64
import os
from fastapi import FastAPI, WebSocket, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import uvicorn
import json

app = FastAPI()

# Монтируем статику
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Инициализация MediaPipe
mp_holistic = mp.solutions.holistic
mp_face_mesh = mp.solutions.face_mesh

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    holistic = mp_holistic.Holistic(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    
    try:
        while True:
            data = await websocket.receive_text()
            
            # Декодируем base64 изображение
            encoded_data = data.split(',')[1] if ',' in data else data
            nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                continue
            
            # BGR в RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb_frame.flags.writeable = False
            
            # Обработка
            holistic_results = holistic.process(rgb_frame)
            face_results = face_mesh.process(rgb_frame)
            
            # Собираем данные
            motion_data = {
                "pose": [],
                "face": [],
                "left_hand": [],
                "right_hand": []
            }
            
            # Поза тела (33 точки)
            if holistic_results.pose_landmarks:
                for lm in holistic_results.pose_landmarks.landmark:
                    motion_data["pose"].append({
                        "x": round(lm.x, 4),
                        "y": round(lm.y, 4),
                        "z": round(lm.z, 4),
                        "visibility": round(lm.visibility, 4)
                    })
            
            # Лицо (468 точек)
            if face_results.multi_face_landmarks:
                for lm in face_results.multi_face_landmarks[0].landmark:
                    motion_data["face"].append({
                        "x": round(lm.x, 4),
                        "y": round(lm.y, 4),
                        "z": round(lm.z, 4)
                    })
            
            # Левая рука (21 точка)
            if holistic_results.left_hand_landmarks:
                for lm in holistic_results.left_hand_landmarks.landmark:
                    motion_data["left_hand"].append({
                        "x": round(lm.x, 4),
                        "y": round(lm.y, 4),
                        "z": round(lm.z, 4)
                    })
            
            # Правая рука (21 точка)
            if holistic_results.right_hand_landmarks:
                for lm in holistic_results.right_hand_landmarks.landmark:
                    motion_data["right_hand"].append({
                        "x": round(lm.x, 4),
                        "y": round(lm.y, 4),
                        "z": round(lm.z, 4)
                    })
            
            await websocket.send_json(motion_data)
            
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        holistic.close()
        face_mesh.close()
        await websocket.close()

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)