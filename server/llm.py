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
    # ==========================================
    # 一、几何基础与多边形
    # ==========================================
    "三角形中位线定理",
    "勾股定理",
    "全等三角形判定",
    "平行四边形的判定与性质",
    "矩形的性质与判定",
    "菱形的性质与判定",
    "正方形的性质与判定",
    "正方形对角线上的点到顶点的距离相等",
    "图形的平移与旋转",
    "轴对称与中心对称",
    "翻折图形，同步信息，连接对称点",
    "遇到梯形想平移",
    "遇到中线想倍长",

    "中点辅助线：中线倍长",
    "中点辅助线：直角三角形斜边中线",
    "中点辅助线：中位线",

    # ==========================================
    # 二、相似三角形（核心扩充：模型、辅助线与技巧）
    # ==========================================
    # 1. 基础判定与性质
    "相似三角形判定 1：两个角相等（AA）",
    "相似三角形判定 2：夹角相等，夹边成比例（SAS）",
    "相似三角形判定 3：边边边成比例（SSS）",
    "平行线分线段成比例定理：三条平行线截两条直线，所得对应线段成比例",
    "相似三角形性质：对应线段（高/中线/角平分线）的比等于相似比",
    "相似三角形性质：周长的比等于相似比，面积的比等于相似比的平方",

    # 2. 经典基础模型
    "相似三角形基础模型：A 字模型（平行于三角形一边）",
    "相似三角形基础模型：反 A 字模型（共角且另一角相等）",
    "相似三角形基础模型：8 字模型（对顶角相等，常结合平行线）",
    "相似三角形基础模型：反 8 字模型（共圆或圆幂定理衍生）",
    "相似三角形基础模型：角平分线模型（角平分线平行于一边构造等腰与相似）",
    "相似三角形基础模型：射影定理（直角三角形斜边上的高，分成的两个小三角形与原三角形相似）",

    # 3. 压轴高阶模型（中考必考）
    "相似三角形高阶模型：一线三等角（K 型图），同侧或异侧三个相等角，必有两对相似三角形，常用于坐标系求点坐标",
    "相似三角形高阶模型：旋转相似（手拉手模型），共顶点的两个等腰/等边/直角三角形旋转，必产生一对新的相似三角形",
    "相似三角形高阶模型：梯形蝴蝶模型，梯形对角线分成的四个三角形，上下两个相似，左右两个面积相等",
    "相似三角形高阶模型：半角模型，正方形或等腰直角三角形内部含一半角，必产生三对相似三角形",
    "相似三角形高阶模型：弦图模型（赵爽弦图），大正方形内含小正方形，四个直角三角形全等，衍生出多组相似与勾股定理",
    "相似三角形高阶模型：十字架模型，矩形或正方形内两条互相垂直的线段，构造三垂直相似求线段比",
    "孤单直角做三垂直构造三角形相似（一线三直角模型）",

    # 4. 辅助线技巧与解题套路
    "相似辅助线技巧 1：遇比例想平行，作平行线构造 A 字或 8 字模型，转移线段比例",
    "相似辅助线技巧 2：遇中点想中位线或倍长中线，构造 8 字模型实现线段倍分关系的转化",
    "相似辅助线技巧 3：截长补短法，在长线段上截取等于短线段，构造相似三角形转移边角关系",
    "相似解题套路 1：遇线段等积式/比例式，先化比例式，找公共角或平行线构造相似",
    "相似解题套路 2：若找不到直接相似，寻找中间比进行等量代换（如 a/b=c/d, c/d=e/f => a/b=e/f）",
    "相似解题套路 3：坐标系中的相似，利用解析几何设点坐标表示线段，或利用斜率关系构造 K 型图转化为代数方程",
    "相似与圆综合：切割线定理与相交弦定理的本质是相似，利用圆周角定理找等角构造相似三角形",

    # 5. 易错点与避坑指南
    "相似避坑 1：书写相似符号时，对应顶点字母必须严格对齐，如△ABC∽△DEF，绝不能写错顺序",
    "相似避坑 2：动点相似分类讨论，题目仅告知两三角形相似而未指明对应顶点时，必须按对应边成比例分情况讨论（通常有 3 种情况）",
    "相似避坑 3：注意隐含的等角条件，如公共角、对顶角、平行线带来的同位角/内错角、同角或等角的余角/补角",
    "相似避坑 4：求面积比时，务必先求出相似比，面积比等于相似比的平方，切忌将边长比直接当面积比",

    # ==========================================
    # 三、函数（一次、反比例、二次）
    # ==========================================
    "一次函数与图像",
    "反比例函数定义与图像：y=k/x（k≠0），图像是双曲线，不与坐标轴相交",
    "反比例函数 k 的几何意义：过图像上一点向坐标轴作垂线，与坐标轴围成的矩形面积等于 |k|，三角形面积等于 |k|/2",
    "反比例函数 k>0 图像在一、三象限，y 随 x 增大而减小；k<0 图像在二、四象限，y 随 x 增大而增大",
    "反比例函数图像上任意一点坐标满足 xy=k（横纵坐标乘积为定值）",
    "反比例函数图像既是中心对称图形（对称中心是原点）也是轴对称图形（对称轴为 y=x 和 y=-x）",
    "反比例函数与一次函数交点：联立方程求解；比较函数大小用图像上下位置判断",
    "反比例函数与面积结合：作垂线构造矩形或三角形，用 |k| 转移面积",

    # --- 反比例函数·面积模型与对称性（补充） ---
    "反比例函数三种常见面积模型：①矩形面积=|k| ②直角三角形面积=|k|/2 ③梯形面积（过两点分别作坐标轴垂线围成）",
    "反比例函数与一次函数围成封闭图形面积：先联立求交点，再用割补法或积分思想（初中用矩形/三角形拼凑）",
    "反比例函数对称点应用：若 (a,b) 在 y=k/x 上，则 (b,a) 也在图像上（关于 y=x 对称）；(-a,-b) 也在图像上（关于原点对称）",
    "反比例函数中'等积变形'：双曲线上任一点 P，过 P 作 x 轴、y 轴的平行线交坐标轴于 A、B，则 S△OAB=|k|/2 恒定",
    "反比例函数与几何综合求面积：利用 k 的几何意义，将不规则图形面积转化为|k|的加减",
    "反比例函数图像上两点 A(x₁,y₁)、B(x₂,y₂) 与原点构成三角形面积：S=1/2·|x₁y₂-x₂y₁|",
    "反比例函数与一次函数交点的对称性：y=k/x 与 y=mx+n 的两个交点关于原点对称（当 n=0 时）",
    "反比例函数比较大小的陷阱：必须强调'在同一象限内'才能用增减性，跨象限需代入具体值比较",

    "二次函数图像与性质",
    "二次函数对称式表达式",
    "二次函数对称轴公式：x = -b/2a",
    "二次函数顶点公式：(-b/2a, (4ac-b²)/4a)",
    "二次函数一般式化顶点式：配方法",
    "二次函数求与 x 轴交点：令 y=0，解一元二次方程",
    "二次函数与 y 轴交点：令 x=0，交点为 (0, c)",
    "含参二次函数与坐标轴交点个数，二次函数可以退化为一次函数（a=0 时）",
    "二次函数中判断 ab 符号关系：左同右异（对称轴在 y 轴左侧 a,b 同号，右侧异号）",
    "二次函数与一元二次方程的关系：抛物线与 x 轴交点个数由判别式 Δ=b²-4ac 决定",
    "二次函数平移规律：上加下减、左加右减（针对顶点式 y=a(x-h)²+k）",
    "二次函数比较大小：由开口方向与对称轴确定增减性，距对称轴越远函数值越大（或越小）",
    "二次函数与不等式：图像在 x 轴上方对应 y>0，下方对应 y<0，交点即边界",
    "二次函数顶点处取最值：a>0 时取最小值，a<0 时取最大值",
    "二次函数与几何综合：面积最值用水平宽×铅垂高÷2，线段最值转化为函数最值",
    "求二次函数与坐标轴围成图形面积常用铅锤法：S=1/2×水平宽×铅垂高",
    "二次函数与直线交点问题：联立转化为一元二次方程，用判别式判断交点个数",
    "一元二次方程转换为两个函数求交点",

    # --- 二次函数·表达式、存在性与最值（补充） ---
    "二次函数交点式：y=a(x-x₁)(x-x₂)，适用于已知抛物线与 x 轴的两个交点 (x₁,0) 和 (x₂,0)",
    "二次函数三种表达式选用策略：已知三点→一般式；已知顶点→顶点式；已知 x 轴两交点→交点式",
    "二次函数与 x 轴两交点距离公式：|x₁-x₂|=√Δ/|a|=√(b²-4ac)/|a|",
    "二次函数|a|与开口大小：|a|越大开口越窄（越陡），|a|越小开口越宽（越缓）",
    "二次函数系数 c 的几何意义：抛物线与 y 轴交点为 (0,c)，c>0 交于正半轴，c<0 交于负半轴",
    "二次函数特殊值的几何意义：x=1 时 y=a+b+c；x=-1 时 y=a-b+c；x=2 时 y=4a+2b+c；x=-2 时 y=4a-2b+c",
    "二次函数在给定区间 [m,n] 上的最值：需比较顶点是否在区间内，再比较端点值与顶点值",
    "待定系数法求二次函数：①三点代入一般式 ②顶点 + 一点代入顶点式 ③两交点 + 一点代入交点式",
    "二次函数存在性问题——等腰三角形：以动点为顶点分三种情况（两腰分别等于三边中的两边），用距离公式列方程",
    "二次函数存在性问题——直角三角形：以动点为直角顶点分三种情况，用勾股定理或斜率乘积=-1 列方程",
    "二次函数存在性问题——平行四边形：利用对角线互相平分（中点坐标公式），三个定点确定三个可能的第四顶点",
    "二次函数存在性问题——相似三角形：先确定对应角相等，再用对应边成比例列方程，注意分类讨论对应关系",
    "二次函数动点面积最值（铅垂法详解）：S=1/2·|x_A-x_B|·|y_P-y_直线|，将面积表示为关于动点横坐标的二次函数求最值",
    "二次函数中线段和差最值：利用对称性将折线转化为直线（将军饮马），再用两点间距离公式",
    "二次函数中周长最值：固定边 + 动边，动边之和转化为两点间距离，利用对称或圆的性质",
    "二次函数图像上点的对称性：关于对称轴 x=h 对称的两点 (x₁,y) 和 (x₂,y) 满足 x₁+x₂=2h",
    "二次函数与反比例函数综合：联立 y=ax²+bx+c 与 y=k/x，转化为三次方程或因式分解求交点",
    "二次函数中'定弦定角'模型：抛物线上两定点 A、B，动点 P 使∠APB 为定值→P 在过 A、B 的圆弧上（隐形圆）",
    "二次函数中的'胡不归'模型：求 PA+k·PB 最小值（0<k<1），构造角度使 sinθ=k，转化为垂线段最短",
    "二次函数中的'阿氏圆'模型：求 PA+k·PB 最值，当 k≠1 时构造阿波罗尼斯圆转化",
    "二次函数与几何图形面积分割：过抛物线上一点作平行于坐标轴的直线，将不规则图形分割为梯形和三角形",
    "二次函数中'面积相等'问题：同底等高的三角形面积相等，转化为动点到定直线距离相等",
    "二次函数中判断 a、b、c 符号的综合技巧：开口方向→a；对称轴位置→b（左同右异）；y 轴交点→c；特殊点→a+b+c 等",

    # ==========================================
    # 四、圆
    # ==========================================
    "圆的切线性质",
    "圆周角定理",
    "垂径定理",
    "弧长与扇形面积",
    "圆的内接四边形，对角互补",
    "四点共圆判定 1：四边形对角互补或外角等于内对角，则四点共圆",
    "四点共圆判定 2：定边对定角，同侧两角相等则四点共圆；异侧则角互补",
    "四点共圆判定 3：两个直角三角形共斜边，则四个顶点共圆",
    "四点共圆判定 4：到同一点的距离相等，则四点共圆",
    "四点共圆判定 5：相交弦定理逆定理，两弦相交满足 PA·PB=PC·PD 则四点共圆",
    "四点共圆的应用：共圆后用圆周角定理转移等角，用托勒密定理、相交弦定理转化线段关系",
    "圆中常用结论：直径所对圆周角为 90°；同弧所对圆周角相等且等于圆心角的一半",
    "切线的判定与性质：过半径外端且垂直于半径的直线是圆的切线；切线垂直于过切点的半径",
    "切线长定理：圆外一点引两条切线，切线长相等，该点与圆心的连线平分两切线的夹角",
    "弦切角定理：弦切角等于它所夹的弧所对的圆周角",
    "相交弦定理与割线定理：圆内相交弦 PA·PB=PC·PD，圆外割线同样满足",
    "直线与圆的位置关系：相交 d<r、相切 d=r、相离 d>r",
    "圆与圆的位置关系：外离 d>R+r、外切 d=R+r、相交 R-r<d<R+r、内切 d=R-r、内含 d<R-r",
    "正多边形与圆：中心角=360°/n，半径、边心距、边长的一半构成直角三角形",
    "圆中辅助线口诀：遇直径连直角，遇切线连半径，求弦长作垂径，求角找同弧所对圆周角",
    "圆中求弦长：过圆心作弦的垂线（垂径定理），用勾股定理求半弦长再乘 2",
    "圆中求角：圆周角=同弧所对圆心角的一半；圆内接四边形对角互补",

    # --- 圆·公式、模型与辅助线（补充） ---
    "圆心角、弧、弦、弦心距的'等对等'定理：在同圆或等圆中，四组量中有一组相等则其余三组对应相等",
    "弦长公式：弦长=2√(r²-d²)，其中 r 为半径，d 为弦心距（圆心到弦的距离）",
    "弧长公式：l=nπr/180（n 为圆心角度数，r 为半径）",
    "扇形面积公式：S=nπr²/360=1/2·l·r（l 为弧长）",
    "弓形面积计算：劣弧弓形=扇形面积 - 三角形面积；优弧弓形=扇形面积 + 三角形面积",
    "圆内角定理：顶点在圆内的角等于它所截两段弧所对圆周角之和，即∠APC=1/2(弧 AC+ 弧 BD)",
    "圆外角定理：顶点在圆外的角等于它所截两段弧所对圆周角之差的一半，即∠P=1/2(大弧 - 小弧)",
    "圆锥的侧面积：S 侧=πrl（r 为底面半径，l 为母线长=扇形半径）",
    "圆锥的全面积：S 全=πrl+πr²=πr(l+r)",
    "圆锥展开图关系：扇形弧长=底面圆周长 2πr，扇形半径=母线长 l，扇形圆心角=360°·r/l",
    "隐形圆模型①——定弦定角：线段 AB 固定，动点 P 满足∠APB=定值α（同侧），则 P 在以 AB 为弦的圆弧上",
    "隐形圆模型②——直角对直径：动点 P 满足∠APB=90°，则 P 在以 AB 为直径的圆上",
    "隐形圆模型③——定点定长：动点 P 到定点 O 距离为定值 r，则 P 的轨迹是以 O 为圆心、r 为半径的圆",
    "隐形圆模型④——定角定高：三角形中一角固定且对边上的高固定，顶点轨迹为圆弧",
    "阿波罗尼斯圆（阿氏圆）：到两定点 A、B 距离之比为定值 k（k≠1）的点 P 的轨迹是一个圆",
    "米勒定理（最大张角问题）：过定直线 l 外同侧两点 A、B 作圆与 l 相切于 P，则 P 点处∠APB 最大",
    "圆幂定理统一形式：过点 P 的直线交圆于 A、B 两点，则 PA·PB=|d²-r²|（d 为 P 到圆心距离，r 为半径）",
    "圆幂定理三种情况统一：P 在圆外→割线定理 PA·PB=PT²；P 在圆上→0；P 在圆内→相交弦定理 PA·PB=PC·PD",
    "两圆公共弦性质：两圆相交，公共弦垂直于连心线，且连心线平分公共弦",
    "圆中'等弧对等弦、等弦对等弧、等弦对等圆心角、等弦的弦心距相等'",
    "圆中最值——点到圆的距离：圆外一点到圆上点的最大距离=d+r，最小距离=d-r（d 为点到圆心距离）",
    "圆中最值——圆到直线的距离：圆上点到定直线的最大距离=d+r，最小距离=|d-r|（d 为圆心到直线距离）",
    "圆中最值——两动点问题：两圆上各取一点，两点间最大距离=d+r₁+r₂，最小距离=|d-r₁-r₂|",
    "圆中辅助线技巧——遇弦作弦心距：过圆心作弦的垂线，构造直角三角形用勾股定理",
    "圆中辅助线技巧——遇直径连圆周角：直径所对圆周角为 90°，构造直角三角形",
    "圆中辅助线技巧——遇切线连切点半径：切线⊥半径，构造直角三角形",
    "圆中辅助线技巧——遇两圆连心线：连心线过切点（相切时），连心线垂直平分公共弦（相交时）",
    "圆与三角函数结合：在圆中构造直角三角形，用 sin/cos/tan 求弦长、圆心角、弧长",
    "圆中角度计算汇总：圆心角=弧度数；圆周角=1/2 弧度数；弦切角=所夹弧度数的一半；圆内角=1/2(两弧之和)；圆外角=1/2(两弧之差)",
    "圆中'蝴蝶模型'：圆内两条弦相交，形成的对顶三角形相似（由圆周角相等推出）",
    "圆中'燕尾模型'：圆外一点引割线和切线，形成的三角形相似（由弦切角=圆周角推出）",
    "托勒密定理应用技巧：圆内接四边形 ABCD 中，AC·BD=AB·CD+AD·BC，常用于求对角线或证明线段关系",

    # ==========================================
    # 五、动点、最值与几何变换
    # ==========================================
    "瓜豆原理动点轨迹为直线",
    "瓜豆原理动点轨迹为圆",
    "胡不归模型",
    "求最值，两定一动，定线段，构造平行四边形",
    "求最值，两定一动，将军饮马",
    "求最值，逆等线段",
    "求最值，代数题，数形结合",
    "垂美四边形",
    "托勒密定理",
    "坐标法/参数法表示线段，转化为函数最值问题",
    "坐标系中求三角形面积：割补法或水平宽×铅垂高÷2，避免直接用距离公式",

    # ==========================================
    # 六、三角形四心、特殊圆与拓展定理
    # ==========================================
    "三角形内心（角平分线交点，到三边距离相等）",
    "三角形外心（垂直平分线交点，到三顶点距离相等）",
    "三角形重心（中线交点，分中线为 2:1）",
    "三角形垂心（高线交点）",
    "三角形九点圆",
    "韦达定理：x1+x2=-b/a, x1*x2=c/a",
    "构造一元二次方程",
    "梅涅劳斯定理（拓展）：一条直线截三角形的三边（或延长线），三个交点分三边的线段乘积为 1",
    "塞瓦定理（拓展）：三角形内三条共点直线分三边的线段乘积为 1，常用于证明三线共点",

    # ==========================================
    # 七、代数、三角函数与思想方法
    # ==========================================
    # --- 代数与方程（数与式、方程与不等式） ---
    "因式分解",
    "分式方程",
    "不等式与不等式组",
    "复合二次根式，把复合根号前面的系数变为 2，完全平方公式",
    "柯西不等式",

    # --- 锐角三角函数与解直角三角形 ---
    "锐角三角函数定义：sinA=对边/斜边，cosA=邻边/斜边，tanA=对边/邻边",
    "特殊角的三角函数值：30°、45°、60° 的正弦、余弦、正切要熟记",
    "同角三角函数关系：sin²A+cos²A=1，tanA=sinA/cosA；互余两角：sinA=cos(90°-A)",
    "解直角三角形：已知两边或一边一锐角，用勾股定理与三角函数求剩余边角",
    "仰角俯角与坡度坡角：坡度=铅直高度/水平宽度=tanα",
    "解直角三角形记特殊角：30° 角所对直角边是斜边的一半；45° 角是等腰直角三角形",
    "解直角三角形的实际应用：测高、测距问题构造直角三角形，用三角函数列方程",

    # --- 锐角三角函数·进阶公式与技巧（补充） ---
    "锐角三角函数增减性：0°<A<90°时，sinA 随 A 增大而增大，cosA 随 A 增大而减小，tanA 随 A 增大而增大",
    "锐角三角函数值域：0<sinA<1，0<cosA<1，tanA>0（锐角范围内）",
    "构造直角三角形三大技巧：①作高线 ②利用直径构造 90°圆周角 ③过已知角顶点作对边垂线",
    "三角函数求面积公式（拓展）：S△=1/2·a·b·sinC（已知两边及夹角），适用于任意三角形",
    "正弦定理初步（拓展/竞赛）：a/sinA=b/sinB=c/sinC=2R，R 为外接圆半径",
    "余弦定理初步（拓展/竞赛）：c²=a²+b²-2ab·cosC，可视为勾股定理的推广",
    "方位角与方向角问题：北偏东α°、南偏西β°等，解题关键是画出方向十字线构造直角三角形",
    "三角函数在坐标系中的应用：已知角度θ和距离 r，点坐标为 (r·cosθ, r·sinθ)",
    "三角函数与圆结合：弦长=2R·sin(圆心角/2)，其中 R 为圆的半径",
    "解直角三角形'设 k 法'：已知 tanA=3/4，可设对边=3k、邻边=4k、斜边=5k，简化计算",
    "解直角三角形'设 x 列方程法'：已知三角函数值和一条边，设未知边为 x，用三角函数列方程求解",
    "三角函数中的'母子型'直角三角形：大直角三角形中包含小直角三角形，利用公共边建立等量关系",
    "互余角三角函数关系拓展：sinA=cos(90°-A)，cosA=sin(90°-A)，tanA·tan(90°-A)=1",
    "二倍角公式（拓展/竞赛）：sin2A=2sinAcosA，cos2A=cos²A-sin²A=2cos²A-1=1-2sin²A",
    "半角公式（拓展/竞赛）：sin(A/2)=√((1-cosA)/2)，cos(A/2)=√((1+cosA)/2)",
    "和差角公式（拓展/竞赛）：sin(A±B)=sinAcosB±cosAsinB，cos(A±B)=cosAcosB∓sinAsinB",

    "夹角公式：两直线斜率分别为 k1、k2，夹角正切 tanθ=|(k2-k1)/(1+k1k2)|",
    "两直线垂直则 k1·k2=-1，平行则 k1=k2",
    "二倍角公式（拓展）",
    "存在 90 度角就导角",

    # --- 概率与统计 ---
    "概率初步",
    "统计图表分析",
    "加权平均数与方差",

    # --- 数学思想方法与通法 ---
    "配凑思想",
    "数形结合思想",
    "求两函数图像交点：联立方程组，交点坐标同时满足两个解析式",
]

PHYSICS_KNOWLEDGE_POINTS = [
    # ==========================================
    # 一、力学、声学、光学、热学基础
    # ==========================================
    "牛顿第一定律", "牛顿第二定律", "牛顿第三定律", "重力与弹力",
    "摩擦力", "力的合成与分解", "二力平衡", "压强", "液体压强",
    "大气压强", "浮力", "阿基米德原理", "物体浮沉条件",
    "功与功率", "机械效率", "动能与势能", "机械能守恒",
    "杠杆平衡条件", "滑轮组", "斜面", "光的反射", "平面镜成像",
    "光的折射", "凸透镜成像", "温度与物态变化", "比热容",
    "热值", "内能与热机", "速度与平均速度", "声音的产生与传播",
    "浮力，融化，密度大于就升，密度小于就降，密度相等就不变",

    # ==========================================
    # 二、电学基础概念与规律
    # ==========================================
    "摩擦起电的实质是电荷（电子）的转移",
    "带电体具有吸引轻小物体的性质",
    "验电器的工作原理：同种电荷相互排斥。",
    "电流与电路",
    "电路的组成与三种状态（通路、断路、短路）",
    "串联电路与并联电路的识别及规律",
    "电流表的使用与串并联电路电流规律",
    "电压表的使用与串并联电路电压规律",
    "影响电阻大小的因素（材料、长度、横截面积、温度）",
    "滑动变阻器与电阻箱",
    "滑动变阻器一上一下接入电路，滑片越靠近所接下接线柱，接入阻值越小",
    "欧姆定律",
    "伏安法测电阻",
    "电阻的串并联",
    "串联分压，并联分流；串联电流处处相等，并联电压处处相等",
    "串联电阻越串越大，并联电阻越并越小，并联总电阻小于任一支路电阻",
    "电功与电能表",
    "电功率（P=UI、P=W/t、P=I²R、P=U²/R）",
    "额定功率与实际功率",
    "焦耳定律",
    "家庭电路与安全用电",
    "磁场与电流的磁场", "电磁感应",
    "家庭电路：开关接火线，螺丝口灯泡螺旋套接零线，保险丝用电阻率大、熔点低的铅锑合金",

    # ==========================================
    # 三、电学进阶技巧与模型（压轴补充）
    # ==========================================
    "去表法简化电路：分析串并联时，电流表视为导线，电压表视为断路",
    "节点法（等电势法）识别电路：导线（无用电器的线段）两端等电势，可缩为同一点",
    "滑动变阻器接法补充：同上相当于导线，同下相当于定值电阻，失去变阻作用",
    "动态电路分析秒杀口诀：串反并同（串联中变阻器阻值增大，串联元件电流电压减小，变阻器自身电压增大）",
    "电路极值与范围问题（木桶效应）：求最大电流需同时考虑电表量程、变阻器允许最大电流、用电器额定电流，取最严格限制",
    "串联电路比例关系：电压之比等于电阻之比（U1/U2=R1/R2），电功率之比等于电阻之比（P1/P2=R1/R2）",
    "并联电路比例关系：电流之比等于电阻的反比（I1/I2=R2/R1），电功率之比等于电阻的反比（P1/P2=R2/R1）",
    "多挡位电器原理：电源电压不变时，总电阻越小总功率越大（高温挡），总电阻越大总功率越小（低温挡/保温挡）",
    "纯电阻与非纯电阻电路区别：纯电阻（如电炉）W=Q 公式通用；非纯电阻（如电动机）W>Q，只能用 W=UIt 算总功，Q=I²Rt 算发热，禁用 P=U²/R 算总功率",
    "灯泡亮度决定因素及串并联表现：亮度只由实际功率决定；串联时电阻大的实际功率大更亮，并联时电阻小的实际功率大更亮",
    "电路故障判断逻辑 1：电流表无示数且灯不亮为断路；若此时电压表有示数（接近电源电压），则电压表并联部分断路",
    "电路故障判断逻辑 2：电流表有示数且灯不亮为短路；若电压表测该灯则示数为 0",
    "电表异常判断：电流表指针反偏为正负接线柱接反；指针满偏超量程为量程选小或电路短路",
    "U-I 图像物理意义：过原点直线代表定值电阻（斜率越陡阻值越大）；向下弯曲曲线代表小灯泡（电阻随温度升高而增大）",
    "伏安法多次测量目的区别：测定值电阻为减小误差；测小灯泡电阻为探究温度对电阻影响，绝对不能求平均值",
    "缺表法测电阻（伏阻法）：无电流表时，R0 与 Rx 串联，测出 U0 和 Ux，则 Rx=(Ux/U0)*R0",
    "缺表法测电阻（安阻法）：无电压表时，R0 与 Rx 并联，测出 I0 和 Ix，则 Rx=(I0/Ix)*R0",
    "电学计算单位统一原则：必须使用国际单位制（V, A, Ω, J, W），遇到 mA, kW, kW·h 必须先换算",
    "电能表参数计算：如 3000imp/(kW·h) 表示每消耗 1 度电闪烁 3000 次，闪烁 n 次消耗电能 W=n/3000 kW·h",
    "电学解题规范：第一步必须画等效电路图，标出已知量和未知量，理清串并联关系",

    # ==========================================
    # 四、浮力进阶与极值模型（最难考点补充）
    # ==========================================
    "浮力四大计算方法：称重法 (F 浮=G-F 拉)、压力差法 (F 浮=F 向上-F 向下)、阿基米德原理 (F 浮=ρ液 gV 排)、平衡法 (漂浮/悬浮时 F 浮=G 物)",
    "出入水问题核心逻辑：液面升降取决于排开液体体积 V 排的变化，Δh = ΔV 排 / S 容器底",
    "冰融化模型 1（纯冰浮于水面）：冰融化后液面高度不变（因为 F 浮=G 冰=G 化水，即ρ水 gV 排=ρ水 gV 化水，故 V 排=V 化水）",
    "冰融化模型 2（冰包石块）：冰融化后液面下降（石块沉底，V 排变小，总浮力减小）",
    "冰融化模型 3（冰包木块）：冰融化后液面不变（木块最终仍漂浮，总浮力始终等于总重力）",
    "船抛锚模型：船上石头扔进水里，液面下降（石头在船上时 V 排=G 石/ρ水 g，扔水里后 V 排=V 石，因ρ石>ρ水，故 V 石 < G 石/ρ水 g）",
    "剪断绳子/拿走物体液面变化：用整体法，ΔF 浮 = ΔG 总，进而求出 ΔV 排 = ΔF 浮 / (ρ液 g)，最后求 Δh",
    "浮力与压强综合：容器底部液体压强变化 Δp = ρ液 gΔh；容器对桌面压力变化用整体法 ΔF = ΔG 总（注意是否有外力提拉或液体溢出）",
    "浮力避坑 1：V 排不一定等于 V 物，只有完全浸没时才相等；计算时务必先判断物体状态（漂浮、悬浮还是沉底）",
    "浮力避坑 2：物体沉底时，F 浮 < G 物，容器底对物体有支持力 N = G 物 - F 浮；此时容器对桌面压力 = G 容 + G 液 + G 物（整体法，内力抵消）",
    "浮力避坑 3：空心物体的密度是“平均密度”，计算漂浮条件时，质量是总质量，体积是包含空心部分的总体积",
    "浮力极值问题：求最大浮力通常对应物体刚好完全浸没（V 排=V 物）；求最小拉力通常对应浮力最大时",

    # ==========================================
    # 五、比热容与热学进阶技巧（避坑与图像）
    # ==========================================
    "比热容核心公式：Q = cmΔt（吸热Δt = t - t0，放热Δt = t0 - t），注意Δt 是温度变化量，不是末温",
    "比热容是物质的特性：只与物质种类和状态有关，与质量、体积、温度高低、吸放热多少均无关（如一杯水倒掉一半，比热容不变；水结冰，比热容改变）",
    "控制变量法比较比热容：相同质量、吸收相同热量（加热时间相同）时，温度升高慢的（Δt 小），比热容 c 大（如水比沙子升温慢，c 水大）",
    "比热容 T-t 图像题秒杀：图像斜率越小（越平缓），比热容越大。因为 Δt = Q/(cm)，斜率 k ∝ 1/c",
    "热平衡方程（不计热损失）：Q 吸 = Q 放，即 c1m1(t - t01) = c2m2(t02 - t)，注意混合后的最终温度 t 是相同的",
    "加热效率问题计算：η = (Q 吸 / Q 放) × 100% = (cmΔt / qm 燃料) × 100% 或 (cmΔt / Pt) × 100%",
    "热学避坑 1：题目中“升高了 20℃”表示Δt=20，“升高到 20℃”表示末温 t=20，审题必须抠字眼",
    "热学避坑 2：热平衡计算前，必须先判断是否有物态变化！如 0℃的冰吸热先熔化（温度不变），不能直接套用 Q=cmΔt 计算升温",
    "热学避坑 3：燃料燃烧放热公式 Q 放 = qm 中，m 是“实际燃烧”的燃料质量，不是总质量；且实际放热往往小于理论值（因燃烧不充分和热散失）"
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
        '6. 判断题目难度，给出 1-5 星（整数）：1 星为最基础的送分题，2 星为简单题，3 星为常规中等题，4 星为较难综合题，5 星为压轴难题。只输出整数，不要输出其他内容。\n'
        '\n'
        '【输出格式】\n'
        '只输出一个 JSON 对象，不要有任何其他文字，不要用 markdown 代码块包裹：\n'
        '{"content": "提取的题干文字", "summary": "简要解题思路", "tags": ["知识点 1", "知识点 2", "知识点 3"], "difficulty": 3}'
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
    difficulty = 3
    if isinstance(parsed, list):
        tags = parsed
    elif isinstance(parsed, dict):
        tags = parsed.get('tags') if isinstance(parsed.get('tags'), list) else []
        content = parsed.get('content', '') if isinstance(parsed.get('content'), str) else ''
        summary = parsed.get('summary', '') if isinstance(parsed.get('summary'), str) else ''
        raw_difficulty = parsed.get('difficulty')
        if isinstance(raw_difficulty, bool):
            difficulty = 3
        elif isinstance(raw_difficulty, (int, float)):
            difficulty = int(raw_difficulty)
        elif isinstance(raw_difficulty, str):
            m = re.search(r'(\d+)', raw_difficulty)
            if m:
                difficulty = int(m.group(1))
        if difficulty < 1:
            difficulty = 1
        elif difficulty > 5:
            difficulty = 5
    else:
        tags = []
    return {'content': content.strip(), 'summary': summary.strip(), 'tags': tags, 'difficulty': difficulty}


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
