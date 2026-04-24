import { useEffect } from 'react'

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | TALASH` : 'TALASH | AI Recruitment'
    return () => { document.title = 'TALASH | AI Recruitment' }
  }, [title])
}