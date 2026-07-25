let video = document.getElementById('video');
let ws = null;
let stream = null;
let interval = null;

async function startCapture() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "user" }
        });
        
        video.srcObject = stream;
        document.querySelectorAll('button')[0].disabled = true;
        document.querySelectorAll('button')[1].disabled = false;
        
        // Подключаем WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        
        ws.onopen = () => {
            console.log('Connected');
            captureFrame();
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            updateData(data);
        };
        
        ws.onerror = (error) => console.error('WebSocket error:', error);
        ws.onclose = () => console.log('Disconnected');
        
    } catch (error) {
        alert('Camera access denied: ' + error.message);
    }
}

function captureFrame() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    ws.send(canvas.toDataURL('image/jpeg', 0.7));
    setTimeout(captureFrame, 100); // 10 FPS
}

function updateData(data) {
    document.getElementById('faceData').textContent = 
        `Points: ${data.face.length}\n${JSON.stringify(data.face.slice(0, 3), null, 2)}...`;
    
    document.getElementById('poseData').textContent = 
        `Points: ${data.pose.length}\n${JSON.stringify(data.pose.slice(0, 3), null, 2)}...`;
    
    document.getElementById('handsData').textContent = 
        `Left: ${data.left_hand.length} points\nRight: ${data.right_hand.length} points`;
}

function stopCapture() {
    if (ws) ws.close();
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    document.querySelectorAll('button')[0].disabled = false;
    document.querySelectorAll('button')[1].disabled = true;
}