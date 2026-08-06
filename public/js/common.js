async function fetchJson(url) {
  try {
    const response = await fetch(url);
    if (response.ok) return await response.json();
  } catch (error) {}
  return [];
}
