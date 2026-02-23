// Entry point for the tldraw browser bundle.
// Bundled with esbuild to create a single file with React + tldraw
// that avoids the dual-React-instance problem from CDN loading.
export { createRoot } from 'react-dom/client'
export { jsx } from 'react/jsx-runtime'
export { Tldraw } from 'tldraw'
