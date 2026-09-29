import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { cabinApi } from '@/api';
import type { CabinSetting, CabinView, ScenePreset } from '@/api/types';

export const useCabinStore = defineStore('cabin', () => {
  const setting = ref<CabinSetting | null>(null);
  const scenes = ref<ScenePreset[]>([]);
  const ambientOptions = ref<CabinView['ambientOptions']>([]);
  const ranges = ref<CabinView['ranges'] | null>(null);
  const loading = ref(false);
  const lastError = ref('');

  const sceneName = computed(() => scenes.value.find((s) => s.key === setting.value?.scene)?.name ?? '自定义');
  const ambientColor = computed(
    () => ambientOptions.value.find((o) => o.key === setting.value?.ambientLight)?.color ?? 'var(--c-text-3)',
  );

  function apply(v: CabinView): void {
    setting.value = v.setting;
    scenes.value = v.scenes;
    ambientOptions.value = v.ambientOptions;
    ranges.value = v.ranges;
  }

  async function load(): Promise<void> {
    loading.value = true;
    try {
      apply(await cabinApi.get());
      lastError.value = '';
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : '座舱状态读取失败';
    } finally {
      loading.value = false;
    }
  }

  /**
   * 局部调节。
   * 采用"先改本地再发请求"的乐观更新：车机上按下温度 + 必须立刻有反馈，
   * 等一个网络往返再动会让触摸感觉很迟钝。失败则回滚。
   */
  async function update(patch: Partial<CabinSetting>): Promise<void> {
    const prev = setting.value ? { ...setting.value } : null;
    if (setting.value) setting.value = { ...setting.value, ...patch, scene: 'custom' } as CabinSetting;
    try {
      apply(await cabinApi.update(patch));
    } catch (e) {
      if (prev) setting.value = prev;
      lastError.value = e instanceof Error ? e.message : '调节失败';
      throw e;
    }
  }

  async function applyScene(key: string): Promise<void> {
    try {
      apply(await cabinApi.scene(key));
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : '场景切换失败';
      throw e;
    }
  }

  return { setting, scenes, ambientOptions, ranges, loading, lastError, sceneName, ambientColor, load, update, applyScene };
});
