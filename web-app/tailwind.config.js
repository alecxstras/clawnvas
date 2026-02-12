module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        node: {
          idle: '#6b7280',
          connecting: '#3b82f6',
          live: '#22c55e',
          offline: '#ef4444',
        }
      }
    },
  },
  plugins: [],
}
