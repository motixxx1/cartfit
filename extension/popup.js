const API = "http://localhost:8000";

document.getElementById("go").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const code = document.getElementById("code").value.trim().toUpperCase();
  if (!code) return;
  status.textContent = "טוען סל…";
  try {
    const res = await fetch(`${API}/api/user/share/${code}`);
    if (!res.ok) throw new Error("קוד לא נמצא");
    const { payload } = await res.json();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: "CARTFIT_INJECT", payload });
    status.textContent = `נשלחו ${payload.items.length} פריטים לעגלה`;
  } catch (err) {
    status.style.color = "#DC2626";
    status.textContent = err.message;
  }
});
