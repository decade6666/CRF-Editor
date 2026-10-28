import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { ElButton } from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import { createNonDecreasingNow } from './testClock.js';

describe('component test clock', () => {
  it('preserves forward progress and repeated millisecond readings', () => {
    let hostTime = 1000;
    const now = createNonDecreasingNow(() => hostTime);

    expect(now()).toBe(1000);
    expect(now()).toBe(1000);
    hostTime = 1005;
    expect(now()).toBe(1005);
  });

  it('clamps host clock rollback until the wall clock catches up', () => {
    let hostTime = 2000;
    const now = createNonDecreasingNow(() => hostTime);
    expect(now()).toBe(2000);

    hostTime = 960;
    expect(now()).toBe(2000);
    hostTime = 1999;
    expect(now()).toBe(2000);
    hostTime = 2001;
    expect(now()).toBe(2001);
  });

  it('delivers a real Vue button click after a host clock rollback', async () => {
    let hostTime = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(createNonDecreasingNow(() => hostTime));
    const onClick = vi.fn();
    const Root = defineComponent({
      setup: () => () => h(ElButton, { onClick }, () => '保存'),
    });
    const wrapper = mount(Root);

    hostTime -= 1040;
    await wrapper.get('button').trigger('click');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('preserves explicitly controlled fake-timer dates and elapsed time', () => {
    vi.useFakeTimers();
    const initial = new Date('2026-10-28T00:00:00Z').getTime();

    vi.setSystemTime(initial);
    expect(Date.now()).toBe(initial);
    vi.advanceTimersByTime(1500);

    expect(Date.now()).toBe(initial + 1500);
  });
});
