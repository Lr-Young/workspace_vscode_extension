import re
import json
import os
import sys
import math

from typing import Dict, List, Tuple, Callable
from tqdm import tqdm

from openai import OpenAI
client = OpenAI(api_key=os.getenv('DEEPSEEK_API_KEY'), base_url="https://api.deepseek.com")

def deepseek_reasoner(content: str) -> Tuple[str, str]:
    messages = [{"role": "user", "content": content}]
    response = client.chat.completions.create(
        model="deepseek-reasoner",
        messages=messages
    )

    return str(response.choices[0].message.reasoning_content), str(response.choices[0].message.content)

def get_evaluation_prompt(question: str, groundtruth_answer: str, evaluation: str, candidate_answer: str) -> str:

    pattern = r'\d+\.\s.*?\(([\d\.]+)\spoint(s)?\):'
    matches = re.findall(pattern, evaluation)
    output_format = ''

    if not matches:
        output_format += f'Criterion 1:\n   - [Score: x1/y1]\n   - Rationale: [Explanation of how the answer addresses this point]\n\n'
        output_format += f'Criterion 2:\n   - [Score: x2/y2]\n   - Rationale: [Explanation of how the answer addresses this point]\n\n'
        output_format += f'...'
    else:
        for i, (points, _) in enumerate(matches, 1):
            output_format += f'Criterion {i}:\n   - [Score: x1/{points}]\n   - Rationale: [Explanation of how the answer addresses this point]\n\n'

    evaluation_prompt = f'''
Task: Evaluate a candidate answer against the evaluation scoring criteria and canonical answer for a question.
Question:<question>{question}</question>

Canonical Answer:
<canonical_answer>
{groundtruth_answer}
</canonical_answer>

Evaluation Scoring Criteria:
<evaluation>
{evaluation}
</evaluation>
Total: 10 points

Candidate Answer:
<candidate_answer>
{candidate_answer}
</candidate_answer>

Evaluation Process:

Step 1: Compare the candidate answer to the canonical answer reference.
Step 2: For each scoring criterion:
Check if the candidate answer explicitly addresses the criterion.
Award full points if the answer covers the criterion accurately and completely.
Award partial/no points for incomplete, incorrect, or missing coverage.
Step 3: Provide a rationale for each scoring decision.

Donnot output the process above, only output the evaluation result.
## Output Format
Strictly adhere to this structure (no free-form text):

Candidate Answer Score: [Total]/10

{output_format.strip()}
'''.strip()
    return evaluation_prompt


def parse_evaluation_point(content: str) -> str:
    pattern = r'Candidate Answer Score:\s(?:\[)?([\d\.]+)(?:\])?\/10'
    match = re.match(pattern, content)

    if not match:
        return content
    else:
        return match.group(1)

def test_evaluation_prompt(json_file: str):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    index = 0

    print(data['Question'][index])
    print(data['Evaluation'][index])
    print(data['Answer'][index])
    print(data['CandidateAnswer'][index])

    print(get_evaluation_prompt(data['Question'][index], data['Answer'][index], data['Evaluation'][index], data['CandidateAnswer'][index]))
    

def is_valid_segment(segment: str) -> bool:
    """
    判断字符串是否为 'path:start~end' 格式
    - path: 尽量宽泛，允许任意字符，直到最后一个冒号为止
    - start,end: 必须是正整数，且 start <= end
    """
    # 取最后一个冒号，前面是 path，后面必须是 start~end
    if ":" not in segment:
        return False
    
    path, lines = segment.rsplit(":", 1)  # 从右边切一次
    match = re.match(r"^(\d+)~(\d+)$", lines)
    if not match:
        return False
    
    start, end = int(match.group(1)), int(match.group(2))
    return start <= end and len(path) > 0


# -------------------------
# 工具函数：解析 "path:start~end"
# -------------------------
def parse_segment(segment: str):
    """解析成 (path, start, end)"""
    path, lines = segment.split(":")
    start, end = map(int, lines.split("~"))
    return path, start, end

# -------------------------
# 三个命中函数
# -------------------------

def strict_match(pred: str, gt: str) -> bool:
    """最强：严格匹配（路径相同，start 和 end 完全一致）"""
    return pred == gt

def cover_match(pred: str, gt: str) -> bool:
    """较强：覆盖匹配（路径相同，pred 覆盖 gt 的范围）"""
    p_path, p_start, p_end = parse_segment(pred)
    g_path, g_start, g_end = parse_segment(gt)
    return p_path == g_path and p_start <= g_start and p_end >= g_end

def overlap_match(pred: str, gt: str) -> bool:
    """弱：区间有交集（路径相同，至少重叠 1 行）"""
    p_path, p_start, p_end = parse_segment(pred)
    g_path, g_start, g_end = parse_segment(gt)
    if p_path != g_path:
        return False
    return not (p_end < g_start or g_end < p_start)  # 只要有交集

# -------------------------
# 命中判断：pred 是否命中任一 gt
# -------------------------
def is_hit(pred: str, gts: List[str], match_func: Callable[[str, str], bool]) -> bool:
    return any(match_func(pred, gt) for gt in gts)

# -------------------------
# 指标函数 1: 期望 MRR
# 推导： https://chatgpt.com/share/68a42e05-e574-8006-b591-92dadb1c43d2
# -------------------------
def expected_mrr(preds: List[str], gts: List[str], match_func: Callable[[str, str], bool]) -> float:
    """
    计算期望 MRR (unordered, all permutations equally likely)
    """
    m = len(preds)
    if m == 0:
        return 0.0
    
    # 找出命中数
    h = sum(1 for pred in preds if is_hit(pred, gts, match_func))
    if h == 0:
        return 0.0

    denom = math.comb(m, h)
    score = 0.0
    for k in range(1, m - h + 2):  # k 是第一个命中位置
        score += (1.0 / k) * (math.comb(m - k, h - 1) / denom)
    return score

# -------------------------
# 指标函数 2: Precision
# -------------------------
def precision(preds: List[str], gts: List[str], match_func: Callable[[str, str], bool]) -> float:
    if len(preds) == 0:
        return 0.0
    hit_count = sum(1 for pred in preds if is_hit(pred, gts, match_func))
    return hit_count / len(preds)

# -------------------------
# 指标函数 3: Recall
# -------------------------
def recall(preds: List[str], gts: List[str], match_func: Callable[[str, str], bool]) -> float:
    if len(gts) == 0:
        return 0.0
    hit_count = sum(1 for gt in gts if is_hit(gt, preds, match_func))
    return hit_count / len(gts)

# -------------------------
# 指标函数 4: F1-score
# -------------------------
def f1_score(preds: List[str], gts: List[str], match_func: Callable[[str, str], bool]) -> float:
    p = precision(preds, gts, match_func)
    r = recall(preds, gts, match_func)
    if p + r == 0:
        return 0.0
    return 2 * p * r / (p + r)

# -------------------------
# 指标函数 5: Jaccard 相似度
# -------------------------
def jaccard(preds: List[str], gts: List[str], match_func: Callable[[str, str], bool]) -> float:
    if not preds and not gts:
        return 1.0  # 都为空集合，相似度定义为1
    if not preds or not gts:
        return 0.0  # 其中一个为空集合，相似度为0

    # 计算交集
    intersection = 0
    for gt in gts:
        for pred in preds:
            if match_func(gt, pred):
                intersection += 1
                break  # 一个 GT 条目只计一次

    # 计算并集
    union = len(preds) + len(gts) - intersection
    return intersection / union


def validate_data_format(data: Dict[str, List[str]]) -> Tuple[bool, str]:
    """验证输入对象是否符合特定格式要求
    
    要求：
    1. 必须是 dict[str, list[str]] 格式
    2. 必须包含指定的6个key
    3. 所有list的长度必须一致且不为0
    4. 所有reference的内容必须符合 path:startline~endline 格式
    
    Args:
        data: 待验证的字典对象
        
    Returns:
        Tuple[bool, str]: (是否通过验证, 失败原因)
    """
    # 必需的键列表
    required_keys = {
        'Question', 
        'Reference', 
        'Answer', 
        'Evaluation', 
        'CandidateContext', 
        'CandidateAnswer'
    }
    
    # 检查是否为字典类型
    if not isinstance(data, dict):
        return False, "Input must be a dictionary"
    
    # 检查是否包含所有必需的键
    missing_keys = required_keys - data.keys()
    if missing_keys:
        return False, f"Missing required keys: {missing_keys}"
    
    # 检查所有值是否为列表且元素为字符串
    for key, value in data.items():
        if not isinstance(value, list):
            return False, f"Value for key '{key}' must be a list"
        if not all(isinstance(item, str) for item in value):
            return False, f"All items in list '{key}' must be strings"
    
    # 获取第一个列表的长度作为基准
    first_key = next(iter(required_keys))
    reference_length = len(data[first_key])
    
    # 检查所有列表长度是否一致且不为0
    if reference_length == 0:
        return False, "All lists must have at least one item (length > 0)"
    
    for key in required_keys:
        if len(data[key]) != reference_length:
            return False, f"All lists must have the same length, but '{key}' has length {len(data[key])} (expected {reference_length})"
        
    # 检查 Reference 字段和 CandidateContex 字段的 ref 格式
    
    for refs in [*data['Reference'], *data['CandidateContext']]:
        for ref in refs.split('\n'):
            if not is_valid_segment(ref.strip()):
                return False, f"Ref '${ref}' is not valid ref format: path:startline~endline"
    
    return True, "Validation passed"


def evaluate(data: Dict[str, List[str]]) -> Dict[str, List[str]]:
    valid, reason = validate_data_format(data)
    if not valid:
        print(f'数据格式不正确：{reason}')
        return data
    
    rate_types = {
        'MRR': expected_mrr,
        'Precision': precision,
        'Recall': recall,
        'f1': f1_score,
        'Jaccard': jaccard
    }

    match_types = {
        'Strict_Match': strict_match,
        'Cover_Match': cover_match,
        'Overlap_Match': overlap_match
    }

    for match_type, _ in match_types:
        for ratio, _ in rate_types:
            data[f'{ratio}:{match_type}'] = ['' for _ in range(length)]
    
    length = len(data['Question'])

    data['EvaluationPrompt'] = ['' for _ in range(length)]
    data['EvaluationOutput'] = ['' for _ in range(length)]
    data['EvaluationOutputThinking'] = ['' for _ in range(length)]
    data['EvaluationScore'] = ['' for _ in range(length)]
    
    data['MRR'] = ['' for _ in range(length)]

    for i in tqdm(range(length)):
        question = data['Question'][i]
        reference = data['Reference'][i]
        answer = data['Answer'][i]
        evaluation = data['Evaluation'][i]
        candidate_answer = data['CandidateAnswer'][i]
        candidate_reference = data['CandidateContext'][i]

        # Answer Evaluation
        evaluation_prompt = get_evaluation_prompt(question, answer, evaluation, candidate_answer)
        think, evaluation_output = deepseek_reasoner(evaluation_prompt)
        score = parse_evaluation_point(evaluation_output)

        data['EvaluationPrompt'][i] = evaluation_prompt
        data['EvaluationOutput'][i] = evaluation_output
        data['EvaluationOutputThinking'][i] = think
        data['EvaluationScore'][i] = score

        # Context Evaluation
        gt = [ref.strip() for ref in reference.split('\n') if ref.strip()]
        pred = [ref.strip() for ref in candidate_reference.split('\n') if ref.strip()]

        for match_type, match_func in match_types:
            for ratio, rate_func in rate_types:
                data[f'{ratio}:{match_type}'][i] = f'{rate_func(pred, gt, match_func)}'

    return data

def evaluate_file(file: str):
    with open(file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    data = evaluate(data)

    with open(f'{'.'.join(file.split('.')[:-1])}_evaluated.{file.split('.')[-1]}', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)


def main():
    # 检查是否有命令行参数
    if len(sys.argv) < 2:
        print("Usage: python evaluation.py <file_path>")
        sys.exit(1)  # 退出并返回错误码 1

    file_path = sys.argv[1]  # 获取第一个命令行参数

    # 判断是否为普通文件
    if not os.path.isfile(file_path):
        print(f"'{file_path}' is NOT a regular file or does not exist.")
        sys.exit(1)
    
    evaluate_file(file_path)

if __name__ == "__main__":
    # main()
    
    import pathlib

    p = pathlib.Path("xai-sdk-python\\src\\xai_sdk\\__init__.py")

    print(p.relative_to("xai-sdk-python"))
