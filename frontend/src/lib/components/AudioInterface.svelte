<script>
	import { onMount, onDestroy } from 'svelte';

	const API_URL = 'http://localhost:8000';
	
	let ws = null;
	let transcript = '';
	let isListening = false;
	let frequencyShift = 1.0;
	let dangerAlert = false;
	let dangerLevel = '';
	
	// Audio processing variables
	let audioContext = null;
	let mediaStream = null;
	let sourceNode = null;
	let analyserNode = null;
	let pitchShiftNode = null;
	let scriptProcessor = null;
	
	// Speech recognition
	let recognition = null;

	onMount(() => {
		// Initialize Web Speech API
		if ('webkitSpeechRecognition' in window) {
			recognition = new webkitSpeechRecognition();
			recognition.continuous = true;
			recognition.interimResults = true;
			recognition.lang = 'en-US';

			recognition.onresult = (event) => {
				let interimTranscript = '';
				let finalTranscript = '';

				for (let i = event.resultIndex; i < event.results.length; i++) {
					const transcriptPart = event.results[i][0].transcript;
					if (event.results[i].isFinal) {
						finalTranscript += transcriptPart + ' ';
					} else {
						interimTranscript += transcriptPart;
					}
				}

				transcript = finalTranscript + interimTranscript;
			};

			recognition.onerror = (event) => {
				console.error('Speech recognition error:', event.error);
			};
		}

		// Connect to WebSocket
		connectWebSocket();
	});

	onDestroy(() => {
		stopListening();
		if (ws) {
			ws.close();
		}
	});

	function connectWebSocket() {
		ws = new WebSocket(`ws://localhost:8000/ws/audio`);
		
		ws.onopen = () => {
			console.log('Audio WebSocket connected');
		};

		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			
			if (data.type === 'danger_alert') {
				dangerAlert = true;
				dangerLevel = data.level;
				
				setTimeout(() => {
					dangerAlert = false;
				}, 2000);
			}
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};

		ws.onclose = () => {
			console.log('WebSocket closed, reconnecting...');
			setTimeout(connectWebSocket, 3000);
		};
	}

	async function startListening() {
		try {
			// Get microphone access
			mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			
			// Create audio context
			audioContext = new (window.AudioContext || window.webkitAudioContext)();
			sourceNode = audioContext.createMediaStreamSource(mediaStream);
			analyserNode = audioContext.createAnalyser();
			analyserNode.fftSize = 2048;
			
			// Create script processor for pitch shifting and analysis
			scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
			
			// Connect nodes
			sourceNode.connect(analyserNode);
			analyserNode.connect(scriptProcessor);
			scriptProcessor.connect(audioContext.destination);
			
			// Process audio
			scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
				const inputBuffer = audioProcessingEvent.inputBuffer;
				const outputBuffer = audioProcessingEvent.outputBuffer;
				
				const inputData = inputBuffer.getChannelData(0);
				const outputData = outputBuffer.getChannelData(0);
				
				// Simple pitch shift using resampling
				for (let i = 0; i < outputData.length; i++) {
					const sourceIndex = Math.floor(i / frequencyShift);
					if (sourceIndex < inputData.length) {
						outputData[i] = inputData[sourceIndex];
					} else {
						outputData[i] = 0;
					}
				}
				
				// Analyze amplitude and frequency
				analyzeAudio();
			};
			
			// Start speech recognition
			if (recognition) {
				recognition.start();
			}
			
			isListening = true;
		} catch (error) {
			console.error('Error accessing microphone:', error);
			alert('Could not access microphone. Please grant permission.');
		}
	}

	function stopListening() {
		if (recognition) {
			recognition.stop();
		}
		
		if (scriptProcessor) {
			scriptProcessor.disconnect();
		}
		
		if (sourceNode) {
			sourceNode.disconnect();
		}
		
		if (mediaStream) {
			mediaStream.getTracks().forEach(track => track.stop());
		}
		
		if (audioContext) {
			audioContext.close();
		}
		
		isListening = false;
	}

	function analyzeAudio() {
		if (!analyserNode) return;
		
		const bufferLength = analyserNode.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);
		analyserNode.getByteFrequencyData(dataArray);
		
		// Calculate overall amplitude
		let sum = 0;
		for (let i = 0; i < bufferLength; i++) {
			sum += dataArray[i];
		}
		const amplitude = sum / bufferLength / 255;
		
		// Calculate low frequency energy (< 150 Hz)
		// Assuming sample rate of 44100 Hz
		const lowFreqBinCount = Math.floor((150 / (audioContext.sampleRate / 2)) * bufferLength);
		let lowFreqSum = 0;
		for (let i = 0; i < lowFreqBinCount; i++) {
			lowFreqSum += dataArray[i];
		}
		const lowFreq = lowFreqBinCount > 0 ? lowFreqSum / lowFreqBinCount / 255 : 0;
		
		// Send to backend for danger detection
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({
				type: 'amplitude',
				amplitude: amplitude,
				low_freq: lowFreq
			}));
		}
	}

	function toggleListening() {
		if (isListening) {
			stopListening();
		} else {
			startListening();
		}
	}

	function clearTranscript() {
		transcript = '';
	}
</script>

<div class="audio-interface">
	<!-- Speech-to-Text Display -->
	<div class="stt-panel">
		<div class="panel-header">
			<h3>Real-time Speech-to-Text</h3>
			<button class="clear-btn" on:click={clearTranscript}>Clear</button>
		</div>
		<div class="transcript-display">
			{#if transcript}
				<p>{transcript}</p>
			{:else}
				<p class="placeholder">Transcript will appear here...</p>
			{/if}
		</div>
	</div>

	<!-- Frequency Modifier -->
	<div class="frequency-panel">
		<h3>Frequency Shift</h3>
		<div class="slider-container">
			<label for="freq-shift">
				<span>Shift: {frequencyShift.toFixed(2)}×</span>
			</label>
			<input
				type="range"
				id="freq-shift"
				min="1.0"
				max="2.0"
				step="0.01"
				bind:value={frequencyShift}
				disabled={!isListening}
			/>
			<div class="range-labels">
				<span>1.0×</span>
				<span>2.0×</span>
			</div>
		</div>
	</div>

	<!-- Controls -->
	<div class="controls">
		<button 
			class="control-btn {isListening ? 'listening' : ''}"
			on:click={toggleListening}
		>
			{isListening ? '⏹ Stop' : '🎤 Start Listening'}
		</button>
	</div>

	<!-- Danger Alert -->
	{#if dangerAlert}
		<div class="danger-alert {dangerLevel}">
			⚠️ DANGER SHOCKWAVE DETECTED
		</div>
	{/if}
</div>

<style>
	.audio-interface {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		position: relative;
	}

	.stt-panel {
		background: #1e1e1e;
		border: 2px solid #00ff88;
		border-radius: 8px;
		padding: 1rem;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.panel-header h3 {
		margin: 0;
		color: #00ff88;
		font-size: 1.1rem;
	}

	.clear-btn {
		background: #333;
		color: #fff;
		border: 1px solid #555;
		padding: 0.4rem 0.8rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.clear-btn:hover {
		background: #444;
	}

	.transcript-display {
		background: #0a0a0a;
		border: 1px solid #333;
		border-radius: 6px;
		padding: 1rem;
		min-height: 150px;
		max-height: 300px;
		overflow-y: auto;
	}

	.transcript-display p {
		margin: 0;
		line-height: 1.6;
		color: #e0e0e0;
	}

	.placeholder {
		color: #666;
		font-style: italic;
	}

	.frequency-panel {
		background: #1e1e1e;
		border: 2px solid #00ccff;
		border-radius: 8px;
		padding: 1rem;
	}

	.frequency-panel h3 {
		margin: 0 0 1rem 0;
		color: #00ccff;
		font-size: 1.1rem;
	}

	.slider-container label {
		display: block;
		margin-bottom: 0.5rem;
		color: #00ccff;
		font-weight: bold;
	}

	input[type="range"] {
		width: 100%;
		height: 6px;
		background: #333;
		outline: none;
		border-radius: 3px;
		-webkit-appearance: none;
	}

	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		background: #00ccff;
		cursor: pointer;
		border-radius: 50%;
		box-shadow: 0 0 10px rgba(0, 204, 255, 0.5);
	}

	input[type="range"]::-moz-range-thumb {
		width: 20px;
		height: 20px;
		background: #00ccff;
		cursor: pointer;
		border-radius: 50%;
		border: none;
	}

	input[type="range"]:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.range-labels {
		display: flex;
		justify-content: space-between;
		color: #888;
		font-size: 0.9rem;
		margin-top: 0.3rem;
	}

	.controls {
		display: flex;
		justify-content: center;
	}

	.control-btn {
		background: #00ff88;
		color: #000;
		border: none;
		padding: 1rem 2rem;
		border-radius: 8px;
		font-size: 1.1rem;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.3s;
		box-shadow: 0 4px 6px rgba(0, 255, 136, 0.3);
	}

	.control-btn:hover {
		background: #00cc6a;
		transform: translateY(-2px);
		box-shadow: 0 6px 12px rgba(0, 255, 136, 0.4);
	}

	.control-btn.listening {
		background: #ff4444;
		box-shadow: 0 4px 6px rgba(255, 68, 68, 0.3);
		animation: pulse 2s infinite;
	}

	.control-btn.listening:hover {
		background: #cc0000;
		box-shadow: 0 6px 12px rgba(255, 68, 68, 0.4);
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.danger-alert {
		position: fixed;
		top: 20px;
		left: 50%;
		transform: translateX(-50%);
		background: #ff0000;
		color: #fff;
		padding: 1.5rem 3rem;
		border-radius: 8px;
		font-size: 1.3rem;
		font-weight: bold;
		z-index: 1000;
		animation: shake 0.5s;
		box-shadow: 0 0 30px rgba(255, 0, 0, 0.8);
	}

	.danger-alert.medium {
		background: #ff6600;
		box-shadow: 0 0 30px rgba(255, 102, 0, 0.8);
	}

	@keyframes shake {
		0%, 100% { transform: translateX(-50%) translateY(0); }
		25% { transform: translateX(-50%) translateY(-10px); }
		75% { transform: translateX(-50%) translateY(10px); }
	}
</style>
