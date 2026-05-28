export default [
  {
    context: ['/api'],
    target: 'https://www.strava.com',
    changeOrigin: true,
    secure: true,
    cookieDomainRewrite: 'localhost',
    headers: {
      'Origin': 'https://www.strava.com',
    },
    onProxyReq: (proxyReq) => {
      proxyReq.setHeader('Origin', 'https://www.strava.com');
    },
  },
];
