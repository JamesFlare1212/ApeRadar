import { useEffect, useState } from 'react'

type SidebarPreference = 'auto' | 'collapsed' | 'expanded'
const storageKey = 'aperadar.sidebar'

export function useSidebarPreference() {
  const [preference, setPreference] = useState<SidebarPreference>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved === 'collapsed' || saved === 'expanded') return saved
    } catch { /* The controls still work when local storage is unavailable. */ }
    return 'auto'
  })
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 1000px)').matches)
  useEffect(() => {
    const media = matchMedia('(max-width: 1000px)')
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (preference === 'auto') return
    try { localStorage.setItem(storageKey, preference) } catch { /* Keep the in-memory preference. */ }
  }, [preference])
  const collapsed = preference === 'collapsed' || (preference === 'auto' && narrow)
  function setOpen(open: boolean) { setPreference(open ? 'expanded' : 'collapsed') }
  return { collapsed, setOpen }
}
