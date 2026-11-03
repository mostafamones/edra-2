// @vitest-environment jsdom
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Link from './link'
it('renders an external link as a single native anchor with ref and click behavior', () => {
  const ref = createRef<HTMLAnchorElement>(); const click = vi.fn((event: React.MouseEvent) => event.preventDefault())
  const { container } = render(<Link href="https://outside.example/path#part" ref={ref} target="_blank" onClick={click} className="test">Open</Link>)
  const anchor = screen.getByRole('link'); expect(container.querySelectorAll('a')).toHaveLength(1); expect(ref.current).toBe(anchor); expect(anchor.getAttribute('href')).toBe('https://outside.example/path#part'); expect(anchor.getAttribute('target')).toBe('_blank'); fireEvent.click(anchor, { ctrlKey: true }); expect(click).toHaveBeenCalledOnce()
})
it('renders legacy links without Router interception so the gateway keeps the complete URL', () => {
  render(<Link href="/app/students?q=a%20b" prefetch>Legacy staff</Link>)
  const anchor = screen.getByRole('link', { name: 'Legacy staff' })
  expect(anchor.getAttribute('href')).toBe('/app/students?q=a%20b')
})
