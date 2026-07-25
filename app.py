import cv2
import numpy as np
import mediapipe as mp
import base64
import json
import asyncio
from fastapi import FastAPI, WebSocket, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import uvicorn

app = FastAPI()

# Монтируем статические файлы и шаблоны
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Инициализация MediaPipe
mp_drawing = mp.solutions.drawing_utils
mp_holistic = mp.solutions.holistic
mp_face_mesh = mp.solutions.face_mesh

class MotionCapture:
    def __init__(self):
        self.holistic = mp_holistic.Holistic(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
            model_complexity=1
        )
        self.face_mesh = mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
    def process_frame(self, frame_data):
        """Обработка кадра и извлечение ключевых точек"""
        # Декодируем изображение из base64
        img_bytes = base64.b64decode(frame_data.split(',')[1])
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if frame is None:
            return None
        
        # Конвертируем BGR в RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_rgb.flags.writeable = False
        
        # Обработка
        holistic_results = self.holistic.process(frame_rgb)
        face_mesh_results = self.face_mesh.process(frame_rgb)
        
        # Извлечение данных
        motion_data = {
            'pose_landmarks': self.extract_pose_landmarks(holistic_results),
            'face_landmarks': self.extract_face_landmarks(face_mesh_results),
            'hand_landmarks': {
                'left': self.extract_hand_landmarks(holistic_results, 'left'),
                'right': self.extract_hand_landmarks(holistic_results, 'right')
            }
        }
        
        return motion_data
    
    def extract_pose_landmarks(self, results):
        """Извлечение позы тела"""
        if results.pose_landmarks:
            landmarks = []
            for landmark in results.pose_landmarks.landmark:
                landmarks.append({
                    'x': landmark.x,
                    'y': landmark.y,
                    'z': landmark.z,
                    'visibility': landmark.visibility
                })
            return landmarks
        return None
    
    def extract_face_landmarks(self, results):
        """Извлечение лицевых ориентиров"""
        if results.multi_face_landmarks:
            # Берем 468 точек лица
            landmarks = []
            for face_landmarks in results.multi_face_landmarks:
                for landmark in face_landmarks.landmark:
                    landmarks.append({
                        'x': landmark.x,
                        'y': landmark.y,
                        'z': landmark.z
                    })
                break  # Обрабатываем только первое лицо
            return landmarks
        return None
    
    def extract_hand_landmarks(self, results, hand_type):
        """Извлечение ориентиров рук"""
        hand_landmarks = None
        if hand_type == 'left' and results.left_hand_landmarks:
            hand_landmarks = results.left_hand_landmarks
        elif hand_type == 'right' and results.right_hand_landmarks:
            hand_landmarks = results.right_hand_landmarks
            
        if hand_landmarks:
            landmarks = []
            for landmark in hand_landmarks.landmark:
                landmarks.append({
                    'x': landmark.x,
                    'y': landmark.y,
                    'z': landmark.z
                })
            return landmarks
        return None
    
    def draw_landmarks(self, frame, motion_data):
        """Визуализация ориентиров на кадре (опционально)"""
        if frame is None:
            return None
        
        # Создаем копию для рисования
        annotated_frame = frame.copy()
        
        # Здесь можно добавить визуализацию
        # Но так как обработка на сервере, возвращаем только данные
        
        return annotated_frame

# Инициализация захвата движения
motion_capture = MotionCapture()

@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    """Главная страница"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.websocket("/ws/motion")
async def websocket_motion(websocket: WebSocket):
    """WebSocket для захвата движения в реальном времени"""
    await websocket.accept()
    
    try:
        while True:
            # Получаем данные кадра
            data = await websocket.receive_text()
            
            # Обрабатываем кадр
            motion_data = motion_capture.process_frame(data)
            
            if motion_data:
                # Отправляем данные обратно
                await websocket.send_json({
                    'status': 'success',
                    'motion_data': motion_data
                })
            else:
                await websocket.send_json({
                    'status': 'error',
                    'message': 'Failed to process frame'
                })
                
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()

@app.get("/health")
async def health_check():
    """Проверка здоровья"""
    return {"status": "healthy", "service": "motion-capture"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)