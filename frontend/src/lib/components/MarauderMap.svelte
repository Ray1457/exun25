<script>
	import { onMount, onDestroy } from 'svelte';

	const API_URL = 'http://localhost:8000';
	
	let ws = null;
	let mapImage = null;
	let humans = [];
	let canvas;
	let ctx;
	let isMapLoaded = false;
	let mapInfo = null;
	let maskImage = null;
	let showMaskOverlay = false;

	onMount(() => {
		// Initialize canvas
		if (canvas) {
			ctx = canvas.getContext('2d');
		}
		
		// Connect to WebSocket
		connectWebSocket();
		
		// Fetch map info
		fetchMapInfo();
		
		// Fetch map image
		fetchMapImage();
		
		// Fetch road mask
		fetchRoadMask();
	});

	onDestroy(() => {
		if (ws) {
			ws.close();
		}
	});

	function connectWebSocket() {
		ws = new WebSocket(`ws://localhost:8000/ws/map`);
		
		ws.onopen = () => {
			console.log('Map WebSocket connected');
		};

		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			
			if (data.type === 'map_init') {
				loadMapImage(data.image);
			} else if (data.type === 'positions_update') {
				humans = data.humans;
				drawMap();
			}
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};

		ws.onclose = () => {
			console.log('Map WebSocket closed, reconnecting...');
			setTimeout(connectWebSocket, 3000);
		};
	}

	async function fetchMapImage() {
		try {
			const response = await fetch(`${API_URL}/map-image`);
			if (response.ok) {
				const data = await response.json();
				loadMapImage(data.image);
			}
		} catch (error) {
			console.log('No map available:', error);
		}
	}

	async function fetchMapInfo() {
		try {
			const response = await fetch(`${API_URL}/map-info`);
			if (response.ok) {
				mapInfo = await response.json();
			}
		} catch (error) {
			console.log('Could not fetch map info');
		}
	}

	async function fetchRoadMask() {
		try {
			const response = await fetch(`${API_URL}/road-mask`);
			if (response.ok) {
				const data = await response.json();
				loadMaskImage(data.mask);
			}
		} catch (error) {
			console.log('Could not fetch road mask');
		}
	}

	function loadMaskImage(base64Data) {
		const img = new Image();
		img.onload = () => {
			maskImage = img;
			console.log('Road mask overlay loaded');
			if (showMaskOverlay) {
				drawMap();
			}
		};
		img.src = `data:image/png;base64,${base64Data}`;
	}

	function loadMapImage(base64Data) {
		const img = new Image();
		img.onload = () => {
			mapImage = img;
			isMapLoaded = true;
			drawMap();
		};
		img.src = `data:image/png;base64,${base64Data}`;
	}

	function drawMap() {
		if (!ctx || !mapImage) return;
		
		// Clear canvas
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		
		// Draw map background
		ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);
		
		// Draw mask overlay if enabled
		if (showMaskOverlay && maskImage) {
			ctx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
		}
		
		// Draw large humans as animated dots
		humans.forEach(human => {
			drawHuman(human);
		});
	}

	function drawHuman(human) {
		// Scale coordinates to canvas size
		const scaleX = canvas.width / mapImage.width;
		const scaleY = canvas.height / mapImage.height;
		const x = human.x * scaleX;
		const y = human.y * scaleY;
		
		// Draw outer glow
		ctx.beginPath();
		ctx.arc(x, y, 12, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(255, 107, 0, 0.3)';
		ctx.fill();
		
		// Draw middle ring
		ctx.beginPath();
		ctx.arc(x, y, 8, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(255, 150, 50, 0.6)';
		ctx.fill();
		
		// Draw inner dot
		ctx.beginPath();
		ctx.arc(x, y, 5, 0, Math.PI * 2);
		ctx.fillStyle = '#ff6b00';
		ctx.fill();
		
		// Draw border
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.stroke();
	}
</script>

<div class="marauder-map">
	<!-- Map Canvas -->
	<div class="map-container">
		<canvas
			bind:this={canvas}
			width="800"
			height="600"
			class="map-canvas"
		/>
		{#if !isMapLoaded}
			<div class="map-placeholder">
				<p>Loading static map...</p>
				<p class="hint">Map file: map.png in project root</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.marauder-map {
		display: flex;
		flex-direction: column;
	}

	.map-container {
		position: relative;
		background: #0a0a0a;
		border: 2px solid #ff6b00;
		border-radius: 8px;
		overflow: hidden;
	}

	.map-canvas {
		display: block;
		width: 100%;
		height: auto;
		background: #000;
	}

	.map-placeholder {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		background: rgba(0, 0, 0, 0.8);
		color: #888;
		pointer-events: none;
	}

	.map-placeholder p {
		margin: 0.5rem 0;
		font-size: 1.1rem;
	}

	.hint {
		font-size: 0.9rem;
		color: #666;
	}
</style>
