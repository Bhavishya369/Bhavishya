self.onmessage = event => {
  const rows = event.data;
  if (!Array.isArray(rows)) {
    self.postMessage({ error: 'Invalid startup sort input.' });
    return;
  }

  rows.sort((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  self.postMessage(rows.map(([key]) => key));
};
