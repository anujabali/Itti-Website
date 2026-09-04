// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://itti.org.in',
	// Bind to every interface, so `dev` and `preview` are reachable from a phone
	// or tablet on the same network for real-device testing.
	server: { host: true },
	vite: {
		preview: {
			host: true,
			// A tunnel forwards under its own hostname, which the host check
			// rejects by default. Allowing the tunnel domain specifically rather
			// than disabling the check, which exists to stop DNS rebinding.
			allowedHosts: ['.trycloudflare.com'],
		},
	},
});
