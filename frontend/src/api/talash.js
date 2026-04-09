import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

export const getCandidates = () => api.get('/candidates')

export const getCandidate = (id) => api.get(`/candidates/${id}`)

export const addSupervision = (id, data) =>
  api.post(`/candidates/${id}/supervision`, data)

export const exportCSV = () =>
  api.get('/export/csv', { responseType: 'blob' })

export const exportXLSX = () =>
  api.get('/export/xlsx', { responseType: 'blob' })

export const downloadReport = (id) =>
  api.get(`/report/${id}`, { responseType: 'blob' })

/**
 * Upload CVs via SSE stream.
 * onEvent(event) is called for each SSE message.
 * Returns a cleanup function.
 */
export const uploadCVs = (files, jd, onEvent) => {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  formData.append('jd', jd || '')

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/upload')
  let buffer = ''

  xhr.onprogress = () => {
    buffer += xhr.responseText.slice(buffer.length)
    const lines = buffer.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const payload = JSON.parse(line.slice(6))
          onEvent(payload)
        } catch {
          // partial chunk — wait for next progress
        }
      }
    }
  }

  xhr.send(formData)
  return () => xhr.abort()
}

export default api
