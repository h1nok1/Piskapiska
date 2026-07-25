let video = document.getElementById('videoElement');
let ws = null;
let stream = null;
let isCapturing = false;

const statusDiv = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

async function startCapture() {
    try {
        // Запрашиваем доступ к камере
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            }
        });
        
        video.srcObject = stream;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        // Подключаем WebSocket
        connectWebSocket();
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Failed to access camera: ' + error.message);
    }
}

function stopCapture() {
    isCapturing = false;
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus('disconnected');
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/motion`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        isCapturing = true;
        updateStatus('connected');
        sendFrames();
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'success') {
            updateDisplay(data.motion_data);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus('error');
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        isCapturing = false;
        updateStatus('disconnected');
    };
}

function sendFrames() {
    if (!isCapturing || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Конвертируем в base64
    const frameData = canvas.toDataURL('image/jpeg', 0.8);
    
    // Отправляем на сервер
    ws.send(frameData);
    
    // Отправляем следующий кадр
    requestAnimationFrame(sendFrames);
}

function updateStatus(status) {
    statusDiv.className = 'status ' + status;
    statusDiv.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

function updateDisplay(motionData) {
    // Обновляем данные лица
    if (motionData.face_landmarks) {
        document.getElementById('faceData').textContent = 
            `Face landmarks detected: ${motionData.face_landmarks.length} points\n` +
            `Sample: ${JSON.stringify(motionData.face_landmarks[0], null, 2)}`;
    } else {
        document.getElementById('faceData').textContent = 'No face detected';
    }
    
    // Обновляем данные позы
    if (motionData.pose_landmarks) {
        document.getElementById('poseData').textContent = 
            `Pose landmarks detected: ${motionData.pose_landmarks.length} points\n` +
            `Sample: ${JSON.stringify(motionData.pose_landmarks[0], null, 2)}`;
    } else {
        document.getElementById('poseData').textContent = 'No pose detected';
    }
    
    // Обновляем данные рук
    let handsText = '';
    if (motionData.hand_landmarks.left) {
        handsText += `Left hand: ${motionData.hand_landmarks.left.length} points\n`;
    } else {
        handsText += 'Left hand: not detected\n';
    }
    
    if (motionData.hand_landmarks.right) {
        handsText += `Right hand: ${motionData.hand_landmarks.right.length} points\n`;
    } else {
        handsText += 'Right hand: not detected\n';
    }
    
    document.getElementById('handsData').textContent = handsText;
}

// Обработка закрытия страницы
window.addEventListener('beforeunload', () => {
    stopCapture();
});