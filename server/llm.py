"""
Smart Mistake Lab - LLM 交互模块
负责 Prompt 管理、AI API 调用、响应解析。
"""

from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass
from typing import Optional

import httpx

from log import logger


# ============== Prompt 管理 ==============

# ============== 各学科知识点 ==============

MATH_KNOWLEDGE_POINTS = [
    "三角形中位线定理",
    "勾股定理",
    "一元二次方程",
    "全等三角形判定",
    "二次函数图像与性质",
    "一次函数与图像",
    "反比例函数",
    "平行四边形的判定与性质",
    "矩形的性质与判定",
    "菱形的性质与判定",
    "正方形的性质与判定",
    "正方形对角线上的点到顶点的距离相等",
    "圆的切线性质",
    "圆周角定理",
    "垂径定理",
    "弧长与扇形面积",
    "锐角三角函数",
    "因式分解",
    "分式方程",
    "不等式与不等式组",
    "图形的平移与旋转",
    "轴对称与中心对称",
    "概率初步",
    "统计图表分析",
    "加权平均数与方差",
    "瓜豆原理动点轨迹为直线",
    "瓜豆原理动点轨迹为圆",
    "胡不归",
    "圆的内接四边形，对角互补",
    "四点共圆判定 1：四边形对角互补或外角等于内对角，则四点共圆",
    "四点共圆判定 2：定边对定角，同侧两角相等（如∠ACB=∠ADB 且 C、D 在 AB 同侧）则四点共圆；异侧则角互补",
    "四点共圆判定 3：两个直角三角形共斜边，则四个顶点共圆（圆心为斜边中点）",
    "四点共圆判定 4：到同一点的距离相等（PA=PB=PC=PD），则四点共圆",
    "四点共圆判定 5：相交弦定理逆定理，两弦相交满足 PA·PB=PC·PD 则四点共圆",
    "四点共圆的应用：共圆后用圆周角定理转移等角，用同弧等角、托勒密定理、相交弦定理转化线段关系",
    "求最值，两定一动，定线段，构造平行四边形",
    "求最值，两定一动，将军饮马",
    "求最值，逆等线段",
    "求最值，代数题，数形结合",
    "垂美四边形",
    "托勒密定理",
    "韦达定理",
    "构造一元二次方程",
    "三角形内心",
    "三角形外心",
    "三角形重心",
    "三角形垂心",
    "三角形九点圆",
    "相似三角形判定 1，两个角相等",
    "相似三角形判定 2，夹角，夹边成比例",
    "相似三角形判定 3，边边边成比例",
    "相似三角形，A 字模型",
    "相似三角形，反 A 字模型",
    "相似三角形，8 字模型",
    "相似三角形，反 8 字模型",
    "相似三角形，角平分线模型",
    "相似三角形，射影定理",
    "孤单直角做三垂直构造三角形相似",
    "相似三角形，线段等积式",
    "相似三角形对应线段（高/中线/角平分线）的比等于相似比",
    "相似三角形周长的比等于相似比",
    "相似三角形面积的比等于相似比的平方",
    "坐标法/参数法表示线段，转化为函数最值问题",
    "翻折图形，同步信息，连接对称点",
    "遇到梯形想平移",
    "遇到中线想倍长",
    "柯西不等式",
    "配凑思想",
    "数形结合思想",
    "复合二次根式，把复合根号前面的系数变为 2，完全平方公式",
    "二倍角",
    "存在 90 度角就导角",
    "二次函数对称式表达式",
    "二次函数对称轴公式",
    "二次函数顶点公式",
    "二次函数求与 x 轴交点",
    "一元二次方程转换为两个函数求交点",
    "二次函数一般式化顶点式",
    "二次函数与 y 轴交点，x 等于 0",
    "二次函数与 x 轴交点，y 等于 0",
    "含参二次函数与坐标轴（x 轴、y 轴交点）交点个数，二次函数可以退化为一次函数",
    "二次函数中判断 ab 符号关系，左同右异，如果抛物线的对称轴在 y 轴的左侧，那么 a 和 b 的符号相同，如果抛物线的对称轴在 y 轴的右侧，那么 a 和 b 的符号相反",
    "反比例函数定义与图像：y=k/x（k≠0），图像是双曲线，不与坐标轴相交",
    "反比例函数 k 的几何意义：过图像上一点向坐标轴作垂线，与坐标轴围成的矩形面积等于 |k|，三角形面积等于 |k|/2",
    "反比例函数 k>0 图像在一、三象限，y 随 x 增大而减小；k<0 图像在二、四象限，y 随 x 增大而增大",
    "反比例函数图像上任意一点坐标满足 xy=k（横纵坐标乘积为定值）",
    "反比例函数图像既是中心对称图形（对称中心是原点）也是轴对称图形（对称轴为 y=x 和 y=-x）",
    "反比例函数与一次函数交点：联立方程求解；比较函数大小用图像上下位置判断",
    "反比例函数与面积结合：作垂线构造矩形或三角形，用 |k| 转移面积",
    "锐角三角函数定义：sinA=对边/斜边，cosA=邻边/斜边，tanA=对边/邻边",
    "特殊角的三角函数值：30°、45°、60° 的正弦、余弦、正切要熟记",
    "同角三角函数关系：sin²A+cos²A=1，tanA=sinA/cosA；互余两角：sinA=cos(90°-A)",
    "解直角三角形：已知两边或一边一锐角，用勾股定理与三角函数求剩余边角",
    "仰角俯角与坡度坡角：坡度=铅直高度/水平宽度=tanα，常用于测量类应用题",
    "解直角三角形记特殊角：30° 角所对直角边是斜边的一半；45° 角是等腰直角三角形",
    "二次函数与一元二次方程的关系：抛物线与 x 轴交点个数由判别式 Δ=b²-4ac 决定（Δ>0 两个、Δ=0 一个、Δ<0 无）",
    "二次函数平移规律：上加下减、左加右减（针对顶点式 y=a(x-h)²+k）",
    "二次函数与几何综合：面积最值用水平宽×铅垂高÷2，线段最值转化为函数最值",
    "二次函数比较大小：由开口方向与对称轴确定增减性，距对称轴越远函数值越大（或越小）",
    "二次函数与不等式：图像在 x 轴上方对应 y>0，下方对应 y<0，交点即边界",
    "二次函数顶点处取最值：a>0 时取最小值，a<0 时取最大值，用顶点公式计算",
    "夹角公式：两直线斜率分别为 k1、k2，夹角正切 tanθ=|(k2-k1)/(1+k1k2)|",
    "两直线垂直则 k1·k2=-1，平行则 k1=k2",
    "求二次函数与坐标轴围成图形面积常用铅锤法：S=1/2×水平宽×铅垂高",
    "圆中常用结论：直径所对圆周角为 90°；同弧所对圆周角相等且等于圆心角的一半",
    "切线的判定与性质：过半径外端且垂直于半径的直线是圆的切线；切线垂直于过切点的半径",
    "切线长定理：圆外一点引两条切线，切线长相等，该点与圆心的连线平分两切线的夹角",
    "弦切角定理：弦切角等于它所夹的弧所对的圆周角",
    "相交弦定理与割线定理：圆内相交弦 PA·PB=PC·PD，圆外割线同样满足 PA·PB=PC·PD",
    "直线与圆的位置关系：相交 d<r、相切 d=r、相离 d>r",
    "圆与圆的位置关系：外离 d>R+r、外切 d=R+r、相交 R-r<d<R+r、内切 d=R-r、内含 d<R-r",
    "正多边形与圆：中心角=360°/n，半径、边心距、边长的一半构成直角三角形",
    "圆中辅助线口诀：遇直径连直角，遇切线连半径，求弦长作垂径，求角找同弧所对圆周角",
    "圆中求弦长：过圆心作弦的垂线（垂径定理），用勾股定理求半弦长再乘 2",
    "求两函数图像交点：联立方程组，交点坐标同时满足两个解析式",
    "圆中求角：圆周角=同弧所对圆心角的一半；圆内接四边形对角互补",
    "二次函数与直线交点问题：联立转化为一元二次方程，用判别式判断交点个数",
    "坐标系中求三角形面积：割补法或水平宽×铅垂高÷2，避免直接用距离公式",
    "解直角三角形的实际应用：测高、测距问题构造直角三角形，用三角函数列方程",
]

PHYSICS_KNOWLEDGE_POINTS = [
    "牛顿第一定律", "牛顿第二定律", "牛顿第三定律", "重力与弹力",
    "摩擦力", "力的合成与分解", "二力平衡", "压强", "液体压强",
    "大气压强", "浮力", "阿基米德原理", "物体浮沉条件",
    "功与功率", "机械效率", "动能与势能", "机械能守恒",
    "杠杆平衡条件", "滑轮组", "斜面", "光的反射", "平面镜成像",
    "光的折射", "凸透镜成像", "温度与物态变化", "比热容",
    "热值", "内能与热机", "电流与电路",
    "电路的组成与三种状态（通路、断路、短路）",
    "串联电路与并联电路的识别及规律",
    "电流表的使用与串并联电路电流规律",
    "电压表的使用与串并联电路电压规律",
    "影响电阻大小的因素（材料、长度、横截面积、温度）",
    "滑动变阻器与电阻箱",
    "欧姆定律",
    "伏安法测电阻",
    "电阻的串并联",
    "电功与电能表",
    "电功率（P=UI、P=W/t、P=I²R、P=U²/R）",
    "额定功率与实际功率",
    "焦耳定律",
    "家庭电路与安全用电",
    "动态电路分析（滑动变阻器引起的电流、电压变化）",
    "电路故障的判断（断路与短路）",
    "磁场与电流的磁场", "电磁感应", "速度与平均速度", "声音的产生与传播",
    "浮力，融化，密度大于就升，密度小于就降，密度相等就不变",
    "摩擦起电的实质是电荷（电子）的转移",
    "带电体具有吸引轻小物体的性质",
    "验电器的工作原理：同种电荷相互排斥。",
    "串联分压，并联分流；串联电流处处相等，并联电压处处相等",
    "串联电阻越串越大，并联电阻越并越小，并联总电阻小于任一支路电阻",
    "灯泡亮度由实际功率决定，与额定功率无关",
    "滑动变阻器一上一下接入电路，滑片越靠近所接下接线柱，接入阻值越小",
    "伏安法测电阻多次测量取平均值减小误差；测小灯泡电阻不能取平均值，灯丝电阻随温度升高而增大",
    "动态电路分析顺序：先判变阻器阻值变化，再判总电阻、总电流，最后判各分电压",
    "电流表串联、电压表并联，电流均正进负出",
    "家庭电路：开关接火线，螺丝口灯泡螺旋套接零线，保险丝用电阻率大、熔点低的铅锑合金"
]

CHEMISTRY_KNOWLEDGE_POINTS = [
    "物理变化与化学变化", "物质的性质", "氧气的性质与制取",
    "空气的组成", "水的组成与净化", "质量守恒定律", "化学方程式",
    "碳的单质", "一氧化碳与二氧化碳", "燃烧与灭火",
    "金属材料", "金属的化学性质", "金属活动性顺序", "金属资源的利用与保护",
    "溶液的形成", "溶解度", "溶质质量分数", "溶液的配制",
    "常见的酸", "常见的碱", "中和反应", "溶液的酸碱度 pH",
    "盐的化学性质", "复分解反应", "化学肥料",
    "分子与原子", "原子的结构", "元素与元素周期表",
    "化合价与化学式", "有关化学式的计算", "有关化学方程式的计算",
    "基本实验操作与常见仪器（加热、量取、称量、气密性检查）",
    "空气中氧气含量的测定（红磷燃烧）",
    "催化剂与催化作用",
    "电解水实验与水的组成",
    "过滤、蒸发与蒸馏",
    "离子与原子的区别，原子团（根）",
    "相对原子质量与元素化合价",
    "化学式书写与化学方程式的书写原则",
    "金刚石、石墨与 C60",
    "一氧化碳还原氧化铜（铁的冶炼）",
    "二氧化碳的制取与性质实验",
    "燃烧的条件与灭火原理",
    "化石燃料与新能源（氢能）",
    "合金及其与纯金属的区别",
    "金属与酸、金属与盐溶液的反应",
    "金属的锈蚀条件与防护",
    "饱和溶液与不饱和溶液的转化",
    "溶解度曲线及其含义",
    "稀盐酸与稀硫酸的化学性质",
    "氢氧化钠与氢氧化钙（熟石灰）的化学性质",
    "酸碱指示剂与 pH 试纸的使用",
    "盐的化学性质（与金属、酸、碱、盐反应）",
    "化学与环境（温室效应、酸雨、水污染）",
    "化学与人体健康（营养素、化学元素）",
    "有机合成材料（塑料、合成纤维、合成橡胶）",
    "含杂质物质的化学方程式计算",
    "检验、分离与除杂（气体、固体、液体）",
    "过滤操作“一贴二低三靠”；蒸发时用玻璃棒搅拌防止液滴飞溅",
    "检验氧气用带火星的木条复燃；检验二氧化碳用澄清石灰水变浑浊",
    "排水法收集难溶于水的气体；向上排空气法收集密度大于空气的气体，向下排空气法收集密度小于空气的气体",
    "铁与酸反应生成浅绿色的亚铁盐；铜盐溶液为蓝色，含铁离子的溶液为黄色",
    "金属活动性顺序：钾钙钠镁铝锌铁锡铅（氢）铜汞银铂金，氢前置换出酸中的氢，前面的金属能把后面的金属从其盐溶液中置换出来",
    "复分解反应发生的条件：生成物中有沉淀、气体或水",
    "中和反应：pH<7 加碱，pH>7 加酸；测定 pH 用玻璃棒蘸取溶液滴在 pH 试纸上",
    "溶液稀释前后溶质质量不变；溶质质量分数=溶质质量÷溶液质量×100%",
    "浓硫酸稀释“酸入水，沿器壁，慢慢倒，不断搅”",
    "点燃可燃性气体前先验纯，氢气验纯时发出爆鸣声说明不纯",
    "铁生锈是与氧气和水同时接触，防锈用涂油、刷漆、镀铬等隔绝空气和水",
    "除杂：除去 CO₂ 中的 CO 用灼热氧化铜，除去 CO 中的 CO₂ 用氢氧化钠溶液"
]

ENGLISH_KNOWLEDGE_POINTS = [
    "一般现在时", "一般过去时", "一般将来时", "现在进行时",
    "过去进行时", "现在完成时", "过去完成时", "被动语态",
    "情态动词", "定语从句", "宾语从句", "状语从句",
    "条件状语从句", "虚拟语气", "非谓语动词", "主谓一致",
    "冠词用法", "介词搭配", "形容词与副词比较级", "不定代词",
    "阅读理解 - 主旨大意", "阅读理解 - 细节理解", "阅读理解 - 推理判断",
    "完形填空 - 上下文逻辑", "完形填空 - 词义辨析",
    "书面表达 - 书信格式", "书面表达 - 议论文结构",
    "单词拼写", "短语搭配", "同义词辨析", "反义词"
]

CHINESE_KNOWLEDGE_POINTS = [
    "字音辨析", "字形辨析", "词语运用", "成语运用",
    "病句辨析", "标点符号", "修辞手法", "仿写与句式变换",
    "古诗文默写", "古诗词鉴赏 - 意象", "古诗词鉴赏 - 情感", "古诗词鉴赏 - 手法",
    "文言文实词", "文言文虚词", "文言文翻译", "文言文断句",
    "现代文阅读 - 记叙文", "现代文阅读 - 说明文", "现代文阅读 - 议论文",
    "名著阅读", "综合性学习", "口语交际",
    "作文 - 审题立意", "作文 - 结构布局", "作文 - 素材运用", "作文 - 语言表达",
    "文学常识", "传统文化"
]

# ============== 学科配置 ==============

SUBJECT_CONFIG = {
    "数学": {
        "role": "经验丰富的初中数学老师",
        "knowledge_points": MATH_KNOWLEDGE_POINTS,
    },
    "物理": {
        "role": "经验丰富的初中物理老师",
        "knowledge_points": PHYSICS_KNOWLEDGE_POINTS,
    },
    "化学": {
        "role": "经验丰富的初中化学老师",
        "knowledge_points": CHEMISTRY_KNOWLEDGE_POINTS,
    },
    "英语": {
        "role": "经验丰富的初中英语老师",
        "knowledge_points": ENGLISH_KNOWLEDGE_POINTS,
    },
    "语文": {
        "role": "经验丰富的初中语文老师",
        "knowledge_points": CHINESE_KNOWLEDGE_POINTS,
    },
}

DEFAULT_SUBJECT_CONFIG = {
    "role": "经验丰富的中学老师",
    "knowledge_points": [],
}


def build_analysis_prompt(subject: str = "") -> str:
    """根据学科构建分析 prompt"""
    cfg = SUBJECT_CONFIG.get(subject, DEFAULT_SUBJECT_CONFIG)
    role = cfg["role"]
    knowledge_points = cfg["knowledge_points"]

    if knowledge_points:
        kp_section = (
            '【候选知识点列表】\n'
            + '\n'.join(f'- {kp}' for kp in knowledge_points)
            + '\n\n'
            '4. 优先从上方候选列表中选取解题过程中最匹配的知识点。仅当确实没有匹配项时，允许输出「未分类」或自行推理 1 个最贴切的考点（命名风格与候选列表保持一致）。'
        )
    else:
        kp_section = (
            '4. 自行推理出题目涉及的知识点（命名风格：简洁、具体、专业，不要过于笼统）。'
        )

    return (
        f'你是一位{role}。请读取图片中的题目文字，并识别题目涉及的核心考点。\n'
        '\n'
        '【步骤】\n'
        '1. 提取题干文字（仅保留题目本身，忽略图形描述、解题步骤、答案、批改痕迹）。\n'
        '2. 如果图片里同时有图形和文字，只提取可见的题目文字内容，忽略图形关系本身。\n'
        '3. 从下方【候选知识点列表】中选取 1-4 个最匹配的核心考点，按重要程度排序。\n'
        + kp_section + '\n'
        '5. 给出简要的解题思路：概括解题的关键步骤、方法或切入点，50-100 字，通俗易懂。\n'
        '\n'
        '【输出格式】\n'
        '只输出一个 JSON 对象，不要有任何其他文字，不要用 markdown 代码块包裹：\n'
        '{"content": "提取的题干文字", "summary": "简要解题思路", "tags": ["知识点 1", "知识点 2", "知识点 3"]}'
    )


# 保留旧变量以兼容可能的引用
ANALYSIS_PROMPT = build_analysis_prompt()


# ============== 默认 AI 配置 ==============

@dataclass
class AiConfig:
    api_url: str = ""
    model: str = ""
    api_key: str = ""
    timeout: float = 120.0
    max_tokens: int = 4096

    @classmethod
    def from_env(cls) -> 'AiConfig':
        return cls(
            api_url=os.getenv('AI_API_URL', 'https://api.deepseek.com'),
            model=os.getenv('AI_MODEL', 'deepseek-v4-flash'),
            api_key=os.getenv('AI_API_KEY', ''),
            timeout=float(os.getenv('AI_TIMEOUT', '120')),
            max_tokens=int(os.getenv('AI_MAX_TOKENS', '4096')),
        )


# ============== 端点检测 ==============

def is_anthropic_endpoint(api_url: str) -> bool:
    return bool(re.search(r'/v1/messages(?:$|\?)', api_url))


def is_ollama_chat_endpoint(api_url: str) -> bool:
    return bool(re.search(r'/api/chat(?:$|\?)', api_url))


def is_deepseek_endpoint(api_url: str) -> bool:
    return 'deepseek.com' in api_url.lower()


def is_probably_ollama_base_url(api_url: str) -> bool:
    return bool(re.match(r'^https?://(localhost|127\.0\.0\.1)(:\d+)?/?$', api_url.strip()))


def normalize_api_url(api_url: str) -> str:
    trimmed = api_url.strip()
    if not trimmed:
        return trimmed
    if is_anthropic_endpoint(trimmed) or '/v1/chat/completions' in trimmed or is_ollama_chat_endpoint(trimmed):
        return trimmed
    if is_probably_ollama_base_url(trimmed):
        return f"{trimmed.rstrip('/')}/api/chat"
    return f"{trimmed.rstrip('/')}/v1/chat/completions"


def should_require_api_key(api_url: str) -> bool:
    return is_anthropic_endpoint(api_url)


# ============== 请求构建 ==============

def build_analyze_request(config: AiConfig, api_url: str, image_data_uri: str, image_base64: str, prompt: str = "") -> dict:
    """构建 AI 分析请求，返回 {headers, body}"""
    if not prompt:
        prompt = build_analysis_prompt()
    #输出 prompt
    logger.info(f'[LLM] 使用 Prompt: {prompt}')

    if is_anthropic_endpoint(api_url):
        return {
            'headers': {
                'Content-Type': 'application/json',
                'x-api-key': config.api_key,
                'anthropic-version': '2023-06-01',
            },
            'body': {
                'model': config.model,
                'max_tokens': config.max_tokens,
                'messages': [{
                    'role': 'user',
                    'content': [
                        {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': image_base64.split(',')[1] if ',' in image_base64 else image_base64}},
                        {'type': 'text', 'text': prompt},
                    ]
                }],
            },
        }
    if is_ollama_chat_endpoint(api_url):
        return {
            'headers': {'Content-Type': 'application/json'},
            'body': {
                'model': config.model,
                'stream': False,
                'think': False,
                'options': {'num_predict': config.max_tokens},
                'messages': [{
                    'role': 'user',
                    'content': prompt,
                    'images': [image_base64],
                }],
            },
        }
    # OpenAI 兼容格式
    headers = {'Content-Type': 'application/json'}
    if config.api_key:
        headers['Authorization'] = f'Bearer {config.api_key}'

    if is_deepseek_endpoint(api_url):
        # DeepSeek 当前兼容接口不接受 image_url，这里回退为纯文本消息以避免请求体校验失败。
        return {
            'headers': headers,
            'body': {
                'model': config.model,
                'max_tokens': config.max_tokens,
                'messages': [{
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': prompt},
                        {'type': 'text', 'text': f'图片数据（data URI）：\n{image_data_uri}'},
                    ]
                }],
            },
        }

    return {
        'headers': headers,
        'body': {
            'model': config.model,
            'max_tokens': config.max_tokens,
            'messages': [{
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': prompt},
                        {'type': 'image_url', 'image_url': {'url': image_data_uri}},
                ]
            }],
        },
    }


# ============== 响应解析 ==============

def extract_text_from_response(data: dict, api_url: str) -> str:
    """从 AI 响应中提取文本内容"""
    if is_anthropic_endpoint(api_url):
        text_block = next((block for block in (data.get('content') or []) if block.get('type') == 'text'), None)
        return text_block['text'] if text_block else ''

    if is_ollama_chat_endpoint(api_url):
        message = data.get('message', {})
        content = message.get('content', '')
        thinking = message.get('thinking', '')
        if isinstance(content, str) and content.strip():
            return content
        if isinstance(thinking, str) and thinking.strip():
            logger.info('[LLM] Ollama content 为空，使用 thinking 字段')
            return thinking
        return ''

    content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
    reasoning = data.get('choices', [{}])[0].get('message', {}).get('reasoning', '')
    if isinstance(content, str) and content.strip():
        return content
    # thinking 模型可能把最终答案放在 content，推理过程在 reasoning；
    # 若 content 为空则回退到 reasoning（也可能是 token 不足，仅输出了 reasoning）
    if isinstance(reasoning, str) and reasoning.strip():
        logger.info('[LLM] content 为空，使用 reasoning 字段')
        return reasoning
    if isinstance(content, list):
        return ''.join(item.get('text', '') for item in content if item.get('type') == 'text')
    return ''


def format_ai_error(detail: str) -> str:
    if 'unknown variant `image_url`' in detail or 'expected `text`' in detail.lower():
        return '当前 AI 服务拒绝了图片消息格式（image_url）。该服务的兼容接口没有接受本应用发送的图片输入格式。'
    return f'AI API error: {detail}'


def parse_analysis_result(raw_text: str) -> dict:
    """解析 AI 返回的 JSON 文本，提取 content/tags"""
    cleaned = raw_text.strip()
    cleaned = re.sub(r'^```json\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'^```\s*', '', cleaned)
    cleaned = re.sub(r'```\s*$', '', cleaned)
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        start_positions = [idx for idx in (cleaned.find('['), cleaned.find('{')) if idx != -1]
        parsed = None
        for start in sorted(start_positions):
            try:
                parsed, _ = decoder.raw_decode(cleaned[start:])
                break
            except json.JSONDecodeError:
                continue
        if parsed is None:
            raise
    content = ''
    summary = ''
    if isinstance(parsed, list):
        tags = parsed
    elif isinstance(parsed, dict):
        tags = parsed.get('tags') if isinstance(parsed.get('tags'), list) else []
        content = parsed.get('content', '') if isinstance(parsed.get('content'), str) else ''
        summary = parsed.get('summary', '') if isinstance(parsed.get('summary'), str) else ''
    else:
        tags = []
    return {'content': content.strip(), 'summary': summary.strip(), 'tags': tags}


# ============== 核心分析函数 ==============

async def analyze_image(
    image_path: str,
    config: Optional[AiConfig] = None,
    subject: str = "",
) -> dict:
    """
    分析错题图片，返回 {title, summary, tags}。

    Args:
        image_path: 图片文件的绝对路径
        config: AI 配置，若为 None 则从环境变量读取
        subject: 学科名称（数学/物理/化学/英语/语文），用于选择知识点列表

    Returns:
        {'content': str, 'summary': str, 'tags': list[str]}

    Raises:
        FileNotFoundError: 图片文件不存在
        ValueError: AI 配置无效
        RuntimeError: AI 调用失败
    """
    if config is None:
        config = AiConfig.from_env()

    logger.info(f'[LLM] 开始分析图片：{image_path}')

    # 1. 读取图片并转 base64
    if not os.path.isfile(image_path):
        raise FileNotFoundError(f'图片文件不存在：{image_path}')

    with open(image_path, 'rb') as f:
        image_data = f.read()
    image_base64 = base64.b64encode(image_data).decode('utf-8')

    # 判断图片类型
    ext = os.path.splitext(image_path)[1].lower()
    mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'}
    mime_type = mime_map.get(ext, 'image/jpeg')
    data_uri = f'data:{mime_type};base64,{image_base64}'

    logger.info(f'[LLM] 图片已编码，大小：{len(image_data)} bytes, MIME: {mime_type}')

    # 2. 校验配置
    api_url = normalize_api_url(config.api_url)
    if not api_url or not config.model.strip():
        raise ValueError('AI 配置不完整：请设置 API URL 和模型名')

    if should_require_api_key(api_url) and not config.api_key:
        raise ValueError('该端点需要 API Key')

    logger.info(f'[LLM] 调用 AI API: url={api_url}, model={config.model}')

    # 3. 构建请求
    prompt = build_analysis_prompt(subject)
    request = build_analyze_request(config, api_url, data_uri, image_base64, prompt)

    # 4. 调用 AI
    async with httpx.AsyncClient(timeout=httpx.Timeout(config.timeout), trust_env=False) as client:
        resp = await client.post(api_url, headers=request['headers'], json=request['body'])

    logger.info(f'[LLM] AI 响应：status={resp.status_code}, len={len(resp.text)}')

    if not resp.is_success:
        err_detail = f'HTTP {resp.status_code} {resp.reason_phrase}'
        try:
            err_data = resp.json()
            err_detail = err_data.get('error', {}).get('message') or err_data.get('message') or err_data.get('detail') or err_detail
        except Exception:
            text_snippet = re.sub(r'<[^>]+>', '', resp.text).strip()[:200]
            if text_snippet:
                err_detail = f'HTTP {resp.status_code}: {text_snippet}'
        logger.error(f'[LLM] AI 调用失败：{err_detail}')
        raise RuntimeError(format_ai_error(err_detail))

    # 5. 解析响应
    data = resp.json()
    response_text = extract_text_from_response(data, api_url)
    if not response_text:
        logger.error(f'[LLM] AI 返回无文本内容：{json.dumps(data, ensure_ascii=False)[:500]}')
        raise RuntimeError('AI 未返回文本内容，请检查模型名称')

    logger.info(f'[LLM] AI 返回文本长度：{len(response_text)}')

    # 6. 解析 JSON 结果
    try:
        result = parse_analysis_result(response_text)
        logger.info(f'[LLM] 解析成功：tags={result["tags"]}')
        return result
    except json.JSONDecodeError as e:
        logger.error(f'[LLM] JSON 解析失败：{e}, raw={response_text[:300]}')
        raise RuntimeError(f'AI 返回的不是有效 JSON: {e}')


# ============== 鼓励语生成 ==============

ENCOURAGEMENT_SINGLE_PROMPT = """你是一名学习督促助手。请为下面这道错题生成一句鼓励语。

要求：
- 不超过 18 个汉字
- 语气幽默、自然、轻松，不要像在上课
- 鼓励但不说教，不要用"加油""你可以的"这类空话
- 不要复述题干、学科名、标签等信息，但可以借助学科背景使语气更有针对性
- 可以轻微调侃拖延练习的状态，但不要冒犯
- 更像一句短促、顺口的提醒，而不是分析建议
- 只输出 JSON 对象，不要输出任何其他文字，不要用 markdown 代码块包裹
- 格式：{"message": "..."}
"""


def parse_encouragement_result(raw_text: str) -> list[dict]:
    """解析鼓励语 AI 响应，返回 [{file_path, message}, ...]"""
    cleaned = raw_text.strip()
    cleaned = re.sub(r'^```json\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'^```\s*', '', cleaned)
    cleaned = re.sub(r'```\s*$', '', cleaned)
    cleaned = cleaned.strip()

    if not cleaned:
        return []

    def normalize_entries(value):
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            if isinstance(value.get("file_path"), str) and isinstance(value.get("message"), str):
                return [value]
            for key in ("reminders", "items", "results", "data"):
                nested = value.get(key)
                if isinstance(nested, list):
                    return nested
            if value and all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
                return [{"file_path": key, "message": val} for key, val in value.items()]
        return []

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        start_positions = [idx for idx in (cleaned.find('['), cleaned.find('{')) if idx != -1]
        parsed = None
        for start in sorted(start_positions):
            try:
                parsed, _ = decoder.raw_decode(cleaned[start:])
                break
            except json.JSONDecodeError:
                continue
        if parsed is None:
            logger.warning(f"[Encourage] 响应不是 JSON，已忽略：{cleaned[:80]}")
            return []
    entries = normalize_entries(parsed)
    if not entries:
        logger.warning(f"[Encourage] 期望 JSON 数组或兼容对象，实际得到 {type(parsed).__name__}，已忽略")
        return []
    return entries


def load_json_relaxed(raw_text: str) -> dict:
    """宽松解析 AI 返回的 JSON，兼容前后夹杂少量说明文本的情况。"""
    cleaned = raw_text.strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()
    for start in (cleaned.find('{'), cleaned.find('[')):
        if start == -1:
            continue
        try:
            parsed, _ = decoder.raw_decode(cleaned[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed

    raise json.JSONDecodeError('Expecting JSON object', cleaned, 0)


async def _generate_single_encouragement(
    item: dict,
    ai_config: AiConfig,
    api_url: str,
) -> str:
    """为单个题目调用 AI 生成一条鼓励语，返回 message 文本，失败返回空字符串"""
    file_path = item.get("file_path", "") or ""
    title = item.get("title", "") or ""
    subject = item.get("subject", "") or ""
    days = round((item.get("inactive_hours", 0) or 0) / 24, 1)

    items_text = f"- 题目：{title if title else '未命名'}\n  学科：{subject if subject else '未分类'}\n  已 {days} 天未练习"
    prompt = ENCOURAGEMENT_SINGLE_PROMPT + "\n\n" + items_text

    headers = {'Content-Type': 'application/json'}
    if ai_config.api_key:
        headers['Authorization'] = f'Bearer {ai_config.api_key}'

    body = {
        'model': ai_config.model,
        'max_tokens': ai_config.max_tokens,
        'stream': False,
        'messages': [
            {'role': 'user', 'content': prompt}
        ],
    }

    if is_ollama_chat_endpoint(api_url):
        body['think'] = False
        body['format'] = 'json'
        body['options'] = {'num_predict': ai_config.max_tokens}

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(ai_config.timeout), trust_env=False) as client:
            resp = await client.post(api_url, headers=headers, json=body)

        # 记录原始响应（只截取前 1000 字符避免日志爆炸）
        raw_preview = resp.text[:1000]
        logger.info(f"[Encourage] 原始响应 (file_path={file_path}): status={resp.status_code}, raw={raw_preview}")

        if not resp.is_success:
            logger.error(f"[Encourage] AI 调用失败：HTTP {resp.status_code}, file_path={file_path}")
            return ""

        response_data = load_json_relaxed(resp.text)
        response_text = extract_text_from_response(response_data, api_url)
        if not response_text:
            logger.warning(f"[Encourage] AI 返回空文本，file_path={file_path}")
            return ""

        # 解析单条 JSON：{"message": "..."}
        cleaned = response_text.strip()
        cleaned = re.sub(r'^```json\s*', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'^```\s*', '', cleaned)
        cleaned = re.sub(r'```\s*$', '', cleaned)
        cleaned = cleaned.strip()

        if not cleaned:
            logger.warning(f"[Encourage] 清理后文本为空，file_path={file_path}")
            return ""

        # 尝试直接解析为 JSON
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            # 尝试从字符串中提取第一个 JSON 对象
            decoder = json.JSONDecoder()
            start = cleaned.find('{')
            if start != -1:
                try:
                    parsed, _ = decoder.raw_decode(cleaned[start:])
                except json.JSONDecodeError:
                    parsed = None
            else:
                parsed = None

        if isinstance(parsed, dict):
            msg = parsed.get("message", "") or ""
            if isinstance(msg, str) and msg.strip():
                return msg.strip()
            # 兼容旧格式：直接返回无 message 键时整个文本当 message
            logger.warning(f"[Encourage] JSON 中无有效 message 字段：{cleaned[:200]}, file_path={file_path}")
            return ""

        # 如果 AI 直接返回了纯文本（无 JSON），直接当 message 用
        text = cleaned.strip().strip('"\'"')
        if text and len(text) < 100:
            logger.info(f"[Encourage] AI 返回纯文本，直接使用：{text}, file_path={file_path}")
            return text

        logger.warning(f"[Encourage] 无法解析 AI 响应：{cleaned[:200]}, file_path={file_path}")
        return ""

    except Exception as e:
        logger.error(f"[Encourage] 调用 AI 异常：{e}, file_path={file_path}")
        return ""


async def generate_encouragements(items: list[dict]) -> dict:
    """
    逐题单独调用 AI 生成鼓励语。
    items: [{title, subject, tags, inactive_hours, is_focus_overdue, file_path}, ...]
    返回：{file_path: message, ...}
    每道题独立调一次 LLM，互不影响。
    """
    from_env = AiConfig.from_env()
    cfg = {
        "api_url": os.environ.get("AI_API_URL") or from_env.api_url,
        "model": os.environ.get("AI_MODEL") or from_env.model,
        "api_key": os.environ.get("AI_API_KEY") or from_env.api_key,
    }
    ai_config = AiConfig(
        api_url=cfg["api_url"],
        model=cfg["model"],
        api_key=cfg["api_key"],
        timeout=120.0,
        max_tokens=1024,
    )
    api_url = normalize_api_url(ai_config.api_url)
    if not api_url or not ai_config.model.strip():
        logger.warning("[Encourage] AI 未配置，跳过鼓励语生成")
        return {}

    logger.info(f"[Encourage] 将逐题调用 AI 生成鼓励语，共 {len(items)} 题")

    result: dict[str, str] = {}
    for idx, item in enumerate(items):
        fp = item.get("file_path", "") or ""
        if not fp:
            continue
        logger.info(f"[Encourage] [{idx + 1}/{len(items)}] 正在生成，file_path={fp}")
        msg = await _generate_single_encouragement(item, ai_config, api_url)
        if msg:
            result[fp] = msg
        else:
            # 单题调用失败时，使用兜底文案
            days = round((item.get("inactive_hours", 0) or 0) / 24, 1)
            fallback = f"这道题已经放了 {days} 天了，不打算看看它吗？"
            result[fp] = fallback
            logger.warning(f"[Encourage] [{idx + 1}/{len(items)}] 生成失败，使用兜底文案，file_path={fp}")

    logger.info(f"[Encourage] 全部完成，成功生成 {len(result)}/{len(items)} 条鼓励语")
    return result
