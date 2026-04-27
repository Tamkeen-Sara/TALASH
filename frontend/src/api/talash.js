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

export const getMissingInfoEmail = (id) =>
  api.get(`/candidates/${id}/email`)

export const deleteCandidate = (id) =>
  api.delete(`/candidates/${id}`)

// Parse SSE events from an XHR stream without duplicates.
// SSE events are separated by \n\n, so split on that boundary
// and keep incomplete trailing event in a buffer for the next tick.
function makeSseParser(onEvent) {
  let processedLen = 0
  let partial = ''
  return (text) => {
    partial += text.slice(processedLen)
    processedLen = text.length
    const chunks = partial.split('\n\n')
    partial = chunks.pop()
    for (const chunk of chunks) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          try { onEvent(JSON.parse(line.slice(6))) } catch { /* partial chunk */ }
        }
      }
    }
  }
}

// Upload individual CV PDFs via SSE stream.
// Returns a cleanup (abort) function.
export const uploadCVs = (files, jd, onEvent) => {
  const formData = new FormData()
  for (const file of files) formData.append('files', file)
  formData.append('jd', jd || '')

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/upload')
  const parse = makeSseParser(onEvent)
  xhr.onprogress = () => parse(xhr.responseText)
  xhr.send(formData)
  return () => xhr.abort()
}

// Upload a single bulk PDF (many CVs in one file) via SSE stream.
// Returns a cleanup (abort) function.
export const uploadBulkPDF = (file, jd, onEvent) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('jd', jd || '')

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/upload/bulk')
  const parse = makeSseParser(onEvent)
  xhr.onprogress = () => parse(xhr.responseText)
  xhr.send(formData)
  return () => xhr.abort()
}

export default api
