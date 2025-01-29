// client/src/api.js
export const fetchData = async (endpoint) => {
    const response = await fetch(`/api/data/${endpoint}`);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  };
  