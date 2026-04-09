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
 * Parse SSE events from an XHR stream without duplicates.
 * SSE events are separated by \n\n — we split on that boundary
 * and keep any incomplete trailing event in the buffer for next tick.
 */
function makeSseParser(onEvent) {
  let buffer = ''
  let processedLength = 0

  return function onProgress(responseText) {
    buffer += responseText.slice(processedLength)
    processedLength = responseText.length

    // Split on SSE event separator \n\n — keeps partial last event
    const parts = buffer.split('\n\n')
    buffer = parts.pop() // last part may be incomplete

    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            onEvent(JSON.parse(line.slice(6)))
          } catch {
            // malformed JSON — skip
          }
        }
      }
    }
  }
}

/**
 * Upload individual CV PDFs via SSE stream.
 * Returns a cleanup (abort) function.
 */
export const uploadCVs = (files, jd, onEvent) => {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  formData.append('jd', jd || '')

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/upload')
  const parse = makeSseParser(onEvent)
  xhr.onprogress = () => parse(xhr.responseText)
  xhr.send(formData)
  return () => xhr.abort()
}

/**
 * Upload a single multi-CV PDF via SSE bulk endpoint.
 * Returns a cleanup (abort) function.
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