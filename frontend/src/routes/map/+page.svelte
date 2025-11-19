<script>
	import MarauderMap from '$lib/components/MarauderMap.svelte';
</script>

<svelte:head>
	<title>Marauder Map - Miniature Human Systems</title>
</svelte:head>

<main>
	<div class="container">
		<!-- UI will be added here -->
		<MarauderMap />
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
		background: #1a1a1a;
		color: #e0e0e0;
	}

	main {
		min-height: 100vh;
		padding: 2rem;
	}

	.container {
		max-width: 1600px;
		margin: 0 auto;
	}
</style>
