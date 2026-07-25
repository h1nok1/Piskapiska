let video = document.getElementById('videoElement');
let ws = null;
let stream = null;
let isTracking = false;
let frameInterval = null;

const statusBadge = document.getElementById('statusBadge');
const trackingIndicator = document.getElementById('trackingIndicator');
const stopBtn = document.getElementById('stopBtn');

// Автоматический запуск при загрузке страницы
window.addEventListener('load', () => {
    console.log('Page loaded, starting automatic tracking...');
    startAutomaticTracking();
});

async function startAutomaticTracking() {
    try {
        // Запрашиваем доступ к камере
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user",
                frameRate: { ideal: 30 }
            }
        });
        
        video.srcObject = stream;
        
        // Ждем пока видео загрузится
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve();
            };
        });
        
        // Подключаем WebSocket
        connectWebSocket();
        
        updateStatus('tracking', '📷 Camera active - Starting tracking...');
        
    } catch (error) {
        console.error('Camera access error:', error);
        updateStatus('error', '❌ Camera access denied! Please allow camera access.');
        
        // Показываем инструкцию
        alert('Please allow camera access to use motion capture!\n\n' +
              '1. Check if camera is connected\n' +
              '2. Allow camera permissions in browser\n' +
              '3. Refresh the page');
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected successfully');
        isTracking = true;
        trackingIndicator.style.display = 'block';
        stopBtn.style.display = 'inline-block';
        updateStatus('tracking', '● Tracking Active - Face, Hands & Body');
        startSendingFrames();
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            updateTrackingData(data);
        } catch (error) {
            console.error('Error parsing data:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus('error', '⚠ Connection error - Retrying...');
        // Попытка переподключения
        setTimeout(() => {
            if (!isTracking) {
                connectWebSocket();
            }
        }, 3000);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (isTracking) {
            updateStatus('error', '⚠ Connection lost - Reconnecting...');
            setTimeout(() => {
                if (isTracking) {
                    connectWebSocket();
                }
            }, 2000);
        }
    };
}

function startSendingFrames() {
    if (frameInterval) {
        clearInterval(frameInterval);
    }
    
    // Отправляем кадры каждые 100ms (10 FPS для стабильности)
    frameInterval = setInterval(() => {
        if (!isTracking || !ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            
            const ctx = canvas.getContext('2d');
            // Зеркалим изображение для естественного отображения
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Отправляем кадр
            const frameData = canvas.toDataURL('image/jpeg', 0.7);
            ws.send(frameData);
        }
    }, 100);
}

function updateTrackingData(data) {
    // Обновляем данные лица
    if (data.face && data.face.length > 0) {
        document.getElementById('faceCount').textContent = `${data.face.length} points`;
        document.getElementById('faceData').innerHTML = 
            `<div style="color: #4CAF50;">✓ Face detected</div>` +
            `<div>Tracking ${data.face.length} facial landmarks</div>` +
            `<div style="margin-top: 10px;">Sample points:</div>` +
            `<pre style="font-size: 11px; color: #666;">${JSON.stringify(data.face.slice(0, 3), null, 2)}</pre>`;
    } else {
        document.getElementById('faceCount').textContent = '0 points';
        document.getElementById('faceData').innerHTML = 
            '<div style="color: #f44336;">⚠ No face detected</div>' +
            '<div>Please ensure your face is visible</div>';
    }
    
    // Обновляем данные позы
    if (data.pose && data.pose.length > 0) {
        document.getElementById('poseCount').textContent = `${data.pose.length} points`;
        document.getElementById('poseData').innerHTML = 
            `<div style="color: #4CAF50;">✓ Pose detected</div>` +
            `<div>Tracking ${data.pose.length} body landmarks</div>` +
            `<div style="margin-top: 10px;">Sample points:</div>` +
            `<pre style="font-size: 11px; color: #666;">${JSON.stringify(data.pose.slice(0, 3), null, 2)}</pre>`;
    } else {
        document.getElementById('poseCount').textContent = '0 points';
        document.getElementById('poseData').innerHTML = 
            '<div style="color: #f44336;">⚠ No pose detected</div>' +
            '<div>Step back to show your full body</div>';
    }
    
    // Обновляем данные рук
    let handsHTML = '';
    let totalHandPoints = 0;
    
    if (data.left_hand && data.left_hand.length > 0) {
        handsHTML += `<div style="color: #4CAF50;">✓ Left hand: ${data.left_hand.length} points</div>`;
        totalHandPoints += data.left_hand.length;
    } else {
        handsHTML += '<div style="color: #FF9800;">⚠ Left hand: not detected</div>';
    }
    
    if (data.right_hand && data.right_hand.length > 0) {
        handsHTML += `<div style="color: #4CAF50;">✓ Right hand: ${data.right_hand.length} points</div>`;
        totalHandPoints += data.right_hand.length;
    } else {
        handsHTML += '<div style="color: #FF9800;">⚠ Right hand: not detected</div>';
    }
    
    document.getElementById('handsCount').textContent = `${totalHandPoints} points`;
    document.getElementById('handsData').innerHTML = handsHTML;
}

function updateStatus(type, message) {
    statusBadge.textContent = message;
    statusBadge.className = 'status-badge';
    
    switch(type) {
        case 'tracking':
            statusBadge.classList.add('status-tracking');
            break;
        case 'idle':
            statusBadge.classList.add('status-idle');
            break;
        case 'error':
            statusBadge.classList.add('status-error');
            break;
    }
}

function stopTracking() {
    isTracking = false;
    
    if (frameInterval) {
        clearInterval(frameInterval);
        frameInterval = null;
    }
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    trackingIndicator.style.display = 'none';
    updateStatus('idle', '⏸ Tracking stopped');
    
    // Перезапускаем через 3 секунды
    setTimeout(() => {
        startAutomaticTracking();
    }, 3000);
}

// Обработка закрытия страницы
window.addEventListener('beforeunload', () => {
    isTracking = false;
    if (frameInterval) clearInterval(frameInterval);
    if (ws) ws.close();
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
});