import api from './api';

/** Fetches a doctor's certificate with the signed-in token (it is not public) as an object URL. */
export async function certificateUrl(doctorId) {
  const res = await api.get(`/doctors/${doctorId}/certificate`, { responseType: 'blob' });
  return { url: URL.createObjectURL(res.data), type: res.data.type };
}

export async function openCertificate(doctorId) {
  // Open the tab first (synchronously) so pop-up blockers allow it, then point it at the file.
  const win = window.open('', '_blank');
  try {
    const { url } = await certificateUrl(doctorId);
    if (win) win.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    win?.close();
    throw err;
  }
}
