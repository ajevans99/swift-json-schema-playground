import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the underlying Monaco-backed editor: we only care about the surrounding
// header chrome (the Clear button) here, not Monaco itself.
vi.mock('../src/components/MonacoJsonEditor', () => ({
  MonacoJsonEditor: ({ value }: { value: string }) => (
    <div data-testid="mock-monaco">{value}</div>
  ),
}))

import { SchemaEditor } from '../src/components/SchemaEditor'
import { InstanceEditor } from '../src/components/InstanceEditor'

describe('SchemaEditor / InstanceEditor Clear button', () => {
  test('SchemaEditor: no Clear button when onClear is omitted', () => {
    render(<SchemaEditor value="{}" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /clear schema/i })).toBeNull()
  })

  test('SchemaEditor: Clear button calls onClear when value is non-empty', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(<SchemaEditor value="{}" onChange={() => {}} onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: /clear schema/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  test('SchemaEditor: Clear button is disabled when value is empty', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(<SchemaEditor value="" onChange={() => {}} onClear={onClear} />)
    const btn = screen.getByRole('button', { name: /clear schema/i })
    expect(btn).toBeDisabled()
    await user.click(btn)
    expect(onClear).not.toHaveBeenCalled()
  })

  test('InstanceEditor: Clear button calls onClear when value is non-empty', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(<InstanceEditor value="{}" onChange={() => {}} onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: /clear instance/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  test('InstanceEditor: Clear button is disabled when value is empty', () => {
    render(
      <InstanceEditor value="" onChange={() => {}} onClear={() => {}} />,
    )
    expect(
      screen.getByRole('button', { name: /clear instance/i }),
    ).toBeDisabled()
  })
})
