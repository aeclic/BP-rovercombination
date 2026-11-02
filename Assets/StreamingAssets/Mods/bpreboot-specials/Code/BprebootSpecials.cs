// bpreboot 特殊部件 —— 运行时编译的源码 Mod。
//
// 作用：把 bp-rebooted（https://github.com/Goggs77/bp-rebooted）里有、而 bpsim 本体
// 没有的皮肤变种，作为【额外】部件加进建造列表。所有新部件都在原版索引之外
// （9000 起），不会替换或覆盖任何原版部件。
//
// 两条数据来源：
//   1. Atlas/bpreboot_skins.txt —— 皮肤图集条目（键名 bpreboot/<皮肤名>）；
//   2. Atlas/bpreboot_icons.txt —— 建造列表图标条目（键名 Part_<Type>_<Index>_Rendered）。
// 两张 txt 共用同一张 Atlas/bpreboot_skins.png，但表头缩放不同（0.01302083 / 0.4）。
//
// 宿主侧依赖的几个 Mod API 都是本仓库为这件事新加的：
//   ModSprites.RegisterAtlas / RegisterSprite  —— 运行时登记图集与精灵条目；
//   ModParts.TryAddVariant / ModSprites.SetSkins —— 克隆变体并换皮肤；
//   PartFactory.PartExtensionMap —— 直接写变体的质量/动力等物理参数。

using System;
using System.Collections.Generic;
using System.Globalization;
using Bpsim.Modding;
using Bpsim.Mods;
using Bpsim.Parts;
using Bpsim.Rendering;
using UnityEngine;

namespace BprebootSpecials
{
	public sealed class Entry : ModEntryPoint
	{
		private const string SkinAtlas = "Bpreboot_Skins";
		private const string IconAtlas = "Bpreboot_Icons";
		private const string SkinAtlasFile = "Atlas/bpreboot_skins.txt";
		private const string IconAtlasFile = "Atlas/bpreboot_icons.txt";
		private const string LookupPrefix = "bpreboot/";

		private GameObject m_host;
		private Bootstrapper m_boot;

		public override void OnLoad()
		{
			// Mod 在 AfterSceneLoad 加载，此时 SpriteManager / PartManager 未必就绪，
			// 交给 Bootstrapper 每 0.5 秒重试一次。
			m_host = new GameObject("BprebootSpecials.Bootstrapper");
			UnityEngine.Object.DontDestroyOnLoad(m_host);
			m_boot = m_host.AddComponent<Bootstrapper>();
			m_boot.Bind(this);
		}

		public override void OnUnload()
		{
			if (m_host != null)
			{
				UnityEngine.Object.Destroy(m_host);
				m_host = null;
			}
			m_boot = null;
		}

		/// <summary>存档是否依赖本 Mod：装了 ≥9000 索引的部件就认为依赖。</summary>
		public override bool IsRequiredForMachine(string machineJson)
		{
			return !string.IsNullOrEmpty(machineJson) && machineJson.Contains("%22partIndex%22: 9");
		}

		internal void Report(string message)
		{
			Debug.Log("[bpreboot-specials] " + message);
		}

		internal void ReportWarn(string message)
		{
			Debug.LogWarning("[bpreboot-specials] " + message);
		}

		/// <summary>把两张 txt 里的条目灌进 SpriteManager。</summary>
		internal bool RegisterSprites()
		{
			SpriteManager manager = SpriteManager.Instance;
			if (manager == null)
			{
				return false;
			}

			Texture2D texture = ModAssets.LoadTexture(ModDirectory, "Atlas/bpreboot_skins.png");
			if (texture == null)
			{
				ReportWarn("读不到 Atlas/bpreboot_skins.png，皮肤不会生效");
				return false;
			}
			texture.wrapMode = TextureWrapMode.Clamp;
			texture.filterMode = FilterMode.Bilinear;

			bool ok = true;
			ok &= LoadAtlasFile(manager, texture, SkinAtlasFile);
			ok &= LoadAtlasFile(manager, texture, IconAtlasFile);
			return ok;
		}

		private bool LoadAtlasFile(SpriteManager manager, Texture2D texture, string relativePath)
		{
			string text = ModAssets.ReadText(ModDirectory, relativePath);
			if (string.IsNullOrEmpty(text))
			{
				ReportWarn("读不到 " + relativePath);
				return false;
			}

			SpriteMap map;
			try
			{
				map = SpriteMap.Read(text);
			}
			catch (Exception ex)
			{
				ReportWarn(relativePath + " 解析失败：" + ex.Message);
				return false;
			}

			SpriteMap.MapHeader header = map.Header;
			if (!manager.HasAtlas(header.Name))
			{
				if (!ModSprites.RegisterAtlas(header.Name, texture, header.Width, header.Height, header.Scale, out string atlasError))
				{
					ReportWarn("注册图集 " + header.Name + " 失败：" + atlasError);
					return false;
				}
			}

			int added = 0;
			foreach (KeyValuePair<string, SpriteMap.MapEntry> pair in map.Data)
			{
				if (!ModSprites.RegisterSprite(pair.Key, header.Name, pair.Value, out string spriteError))
				{
					// 重复登记（Mod 重载）不算错误。
					if (!string.IsNullOrEmpty(spriteError) && spriteError.IndexOf("已存在", StringComparison.Ordinal) < 0)
					{
						ReportWarn("注册精灵 " + pair.Key + " 失败：" + spriteError);
					}
					continue;
				}
				added++;
			}
			Report("图集 " + header.Name + " 登记了 " + added + " 个精灵条目");
			return added > 0;
		}

		/// <summary>注册一个变体；<paramref name="skins"/> 非空时按子物体名换多段皮肤。</summary>
		internal bool AddVariant(string label, PartType type, int baseIndex, int newIndex, string skinKey,
			IDictionary<string, string> skins, int? mass, float? enginePower)
		{
			// 换皮肤必须发生在建 ECS 预制体之前（见 ModParts.TryAddVariant 的 prepare 注释）。
			if (!ModParts.TryAddSkinVariant(type, baseIndex, newIndex, label, skinKey, skins, null, out string error))
			{
				ReportWarn("加变体 " + label + " 失败：" + error);
				return false;
			}

			PartFactory factory = PartManager.Instance != null ? PartManager.Instance.Factory : null;
			ApplyExtension(factory, type, baseIndex, newIndex, mass, enginePower);
			return true;
		}

		private static void ApplyExtension(PartFactory factory, PartType type, int baseIndex, int newIndex, int? mass, float? enginePower)
		{
			if (factory == null)
			{
				return;
			}
			Dictionary<PartTypeInfo, PartExtensionData> map = factory.PartExtensionMap;
			if (map == null)
			{
				return;
			}
			PartTypeInfo baseInfo = new PartTypeInfo(type, baseIndex);
			if (!map.TryGetValue(baseInfo, out PartExtensionData data))
			{
				data = PartFactory.DefaultExtension;
			}
			if (mass.HasValue)
			{
				data.Mass = mass.Value;
			}
			if (enginePower.HasValue)
			{
				data.EnginePower = enginePower.Value;
			}
			map[new PartTypeInfo(type, newIndex)] = data;
		}

		/// <summary>皮肤键名。</summary>
		internal static string Skin(string name)
		{
			return LookupPrefix + name;
		}
	}

	/// <summary>等 PartManager / SpriteManager 就绪后再登记，成功一次即自行销毁。</summary>
	internal sealed class Bootstrapper : MonoBehaviour
	{
		private const float RetryInterval = 0.5f;

		private Entry m_entry;
		private float m_next;
		private bool m_done;

		internal void Bind(Entry entry)
		{
			m_entry = entry;
			m_next = Time.unscaledTime + RetryInterval;
		}

		private void Update()
		{
			if (m_done || m_entry == null || Time.unscaledTime < m_next)
			{
				return;
			}
			m_next = Time.unscaledTime + RetryInterval;

			PartManager partManager = PartManager.Instance;
			if (partManager == null || !partManager.IsReady || partManager.Factory == null)
			{
				return;
			}
			if (partManager.Factory.PartCollection == null)
			{
				return;
			}
			if (!m_entry.RegisterSprites())
			{
				return;
			}
			m_done = RegisterAll(m_entry);
			if (m_done)
			{
				UnityEngine.Object.Destroy(this);
			}
		}

		private static bool RegisterAll(Entry entry)
		{
			int failures = 0;
			// 木框（PartType.WoodenFrame）—— bp-rebooted 的 12/13 号框。
			failures += entry.AddVariant("异形木框", PartType.WoodenFrame, 0, 9000, Entry.Skin("AlienWoodenFrame"), null, 0, 77f) ? 0 : 1;
			failures += entry.AddVariant("异形玻璃框", PartType.WoodenFrame, 0, 9001, Entry.Skin("AlienGlassFrame"), null, 0, null) ? 0 : 1;

			// 铁框（PartType.MetalFrame）—— 半高护栏与三角框、钨方块。
			failures += entry.AddVariant("半高护栏", PartType.MetalFrame, 2, 9000, Entry.Skin("HalfHorizontal"), null, 0, null) ? 0 : 1;
			failures += entry.AddVariant("60° 三角框", PartType.MetalFrame, 2, 9001, Entry.Skin("T60Triangle"), null, 0, null) ? 0 : 1;
			failures += entry.AddVariant("45° 三角框", PartType.MetalFrame, 2, 9002, Entry.Skin("T45Triangle"), null, 0, null) ? 0 : 1;
			failures += entry.AddVariant("钨方块", PartType.MetalFrame, 0, 9003, Entry.Skin("TungstenCube"), null, 5, null) ? 0 : 1;

			// 中型 / 大型发动机。
			failures += entry.AddVariant("异形引擎", PartType.Engine, 0, 9000, null,
				One("EngineVisualization", Entry.Skin("AlienEngineNormal")), 1, 7500f) ? 0 : 1;
			failures += entry.AddVariant("异形大型引擎", PartType.EngineBig, 0, 9000, null,
				One("EngineVisualization", Entry.Skin("AlienEngineBig")), 1, 10000f) ? 0 : 1;

			// 拳套箱 —— bp-rebooted 的活塞拳套箱（两段皮肤）。
			Dictionary<string, string> piston = new Dictionary<string, string>
			{
				{ "Visualization", Entry.Skin("Piston") },
				{ "SpringVisualization", Entry.Skin("PistonHandle") }
			};
			failures += entry.AddVariant("活塞拳套箱", PartType.SpringBoxingGlove, 0, 9000, null, piston, 0, null) ? 0 : 1;

			// 吸盘轮 —— 异形越野吸盘轮。基部件 2 的根上是主贴图，WheelPivot/SpokeSprite 是辐条。
			Dictionary<string, string> wheel = new Dictionary<string, string>
			{
				{ "Part_StickyWheel_2_3", Entry.Skin("AlienWheel") },
				{ "SpokeSprite", Entry.Skin("AlienSpoke") }
			};
			failures += entry.AddVariant("异形越野吸盘轮", PartType.StickyWheel, 2, 9000, null, wheel, 0, null) ? 0 : 1;

			// 吸盘枪/抓钩 —— 五件。
			failures += entry.AddVariant("异形速射枪", PartType.GrapplingHook, 0, 9000, Entry.Skin("AlienRapidGun"), null, 0, null) ? 0 : 1;
			failures += entry.AddVariant("异形加长速射枪", PartType.GrapplingHook, 0, 9001, Entry.Skin("AlienRapidGunExtended"), null, 0, null) ? 0 : 1;
			failures += entry.AddVariant("闪电钩", PartType.GrapplingHook, 0, 9002, Entry.Skin("LightningHook"), null, 0, null) ? 0 : 1;
			failures += entry.AddVariant("磁轨炮", PartType.GrapplingHook, 0, 9003, Entry.Skin("RailGun"), null, 0, null) ? 0 : 1;
			failures += entry.AddVariant("加特林", PartType.GrapplingHook, 5, 9004, Entry.Skin("Gatling"), null, 0, null) ? 0 : 1;

			// 以下三件本体里没有，属于「只改了皮肤的额外内容」，一并补上。
			failures += entry.AddVariant("异形高速桨", PartType.Propeller, 0, 9000, null,
				One("FanVisualization", Entry.Skin("AlienHyperPropeller")), 0, null) ? 0 : 1;
			failures += entry.AddVariant("异形圣诞弹簧", PartType.Spring, 0, 9000, null,
				One("SpringVisualization", Entry.Skin("AlienSantaSpring")), 0, null) ? 0 : 1;
			failures += entry.AddVariant("异形金属 TNT", PartType.TNT, 0, 9000, null,
				One("Visualization", Entry.Skin("AlienMetalTNT")), 0, null) ? 0 : 1;

			entry.Report(failures == 0 ? "全部特殊部件已登记" : ("有 " + failures + " 件没能登记，见上面的警告"));
			return true;
		}

		private static Dictionary<string, string> One(string holder, string key)
		{
			return new Dictionary<string, string> { { holder, key } };
		}
	}
}
