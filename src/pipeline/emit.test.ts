import { describe, expect, it, vi } from 'vitest'
import { sendWithRetry } from './emit'

describe('sendWithRetry', () => {
  it('succeeds without retrying when the send resolves', async () => {
    const send = vi.fn(async () => {})
    await sendWithRetry(send, 'provider')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('retries transient failures up to 3 total attempts', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('transient 1'))
      .mockRejectedValueOnce(new Error('transient 2'))
      .mockResolvedValueOnce(undefined)

    await sendWithRetry(send, 'result')
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('absorbs permanent failures and logs a structured error', async () => {
    const send = vi.fn(async () => { throw new Error('permanent') })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(sendWithRetry(send, 'usage')).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledTimes(3)
    expect(errSpy).toHaveBeenCalledTimes(1)
    const logged = errSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(logged)
    expect(parsed.msg).toBe('pipeline_send_failed')
    expect(parsed.pipeline).toBe('usage')
    expect(parsed.reason).toBe('error')
    errSpy.mockRestore()
  })

  it('does not retry on timeout (avoids duplicate delivery)', async () => {
    const send = vi.fn(() => new Promise<void>(() => {/* hangs forever */}))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(sendWithRetry(send, 'manifest')).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(errSpy.mock.calls[0][0] as string)
    expect(parsed.reason).toBe('timeout')
    errSpy.mockRestore()
  })
})
