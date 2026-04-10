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

function makeSseParser(onEvent) {
  let processedLen = 0
  let partial = ''
  return (text) => {
    const newText = text.slice(processedLen)
    processedLen = text.length
    partial += newText
    const chunks = partial.split('\n\n')
    partial = chunks.pop()
    for (const chunk of chunks) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          try { onEvent(JSON.parse(line.slice(6))) } catch { /* partial */ }
        }
      }
    }
  }
}

/**
 * Upload individual CV files via SSE stream.
 * Returns a cleanup function.
 */
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

/**
 * Upload a single bulk PDF (many CVs in one file) via SSE stream.
 * Returns a cleanup function.
 */
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
