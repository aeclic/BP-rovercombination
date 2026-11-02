# BPRC

**Bad piggies fan-made game--BPLE's Rovercraft Combination version**

> [!WARNING]
> **本项目近乎全部由 AI 辅助开发，测试而来。**
>
> 本项目由反编译的BPLE 2022.1.9 修改而来 包含大量过于激进的改动，暂时停工。
> 然后 AI 就自己源源不断的在缝合代码石块了，测试也不够完全。

> 本仓库与 Rovio Entertainment ltd. ,Mobirate 及 Bad Piggies,RoverCraft，RoverCraft 2，极速赛车向前冲等 **无任何关联**，亦未获其认可。
> "捣蛋猪" / "BP"/ “RC” 等名称仅作技术识别之用，仓库所有者不持有相关商标；
> 产物 DLL/CS 文件名沿用原版名称 仅为交流方便。

## 这是什么


## 许可

本项目作者编写的代码与文档以 **CC0 1.0 Universal** 释出，详见 [`LICENSE.txt`](LICENSE.txt)（含非官方中文参考译文，以英文原文为准）。你可以自由使用、修改、再分发，包括商业用途，无需署名。

CC0 只覆盖作者自己创作的部分，**不改变**仓库内第三方内容的权利状态，也不代表作者有权替它们授权：

| 内容 | 位置 | 权利 / 许可 |
|------|------|------------|
| Bad Piggies 名称、关卡、美术、音频 | 关卡数据（未入库） | © Rovio Entertainment；本项目为非官方粉丝作品 |
| Havok Physics | `Assets/Plugins/Havok.Physics.dll`、`x86_64/HavokNative.dll`、Android `.so` | Havok / Microsoft 专有；此处仅作技术研究 |
| Vuplex WebView | `Assets/Vuplex/` | 商业授权 |
| Unity 包、DOTS、URP、TextMeshPro | `Packages/`、`Assets/Plugins/` | Unity Companion License（另有若干 MIT 依赖） |
| BepInEx 5.4.x | `Mods/FrameShapes/Runtime/` | LGPL-2.1 |
| UniTask、Newtonsoft.Json、IngameDebugConsole 等 | `Assets/Plugins/` | 各自 MIT / 开源许可证，见上游仓库 |
| ShaderRipper、besiege、bple、bpir、bpss、bprc | 参考项目 | 仅作思路与接口对照，未整体搬运 |

**CC0 不等于“整包可商用”**：上面的第三方组件仍受各自许可证约束；`Assets/StreamingAssets/` 未入库也意味着仓库不包含 BPLE 的原始关卡与美术。本地运行请使用你合法持有的游戏副本，并自行承担相应责任。

## 致谢

- 反编译起点：astro**BPLE**；玩法与实现参考：**Besiege**、**BPLE**、**BPIR**、**BPSS**、**BPRC**。
- 工具与依赖：Unity DOTS、Havok、BepInEx、Vuplex、UniTask、Newtonsoft.Json、IngameDebugConsole、ShaderRipper。
- 以及所有被 AI 反复重构、删掉又捡回来的代码。

再次强调：本项目从一句话起步，全部产出（源码、工具、文档）均为 AI 幻觉碰巧幸存的产物，没有人工审查背书，请降低预期后再继续阅读。
