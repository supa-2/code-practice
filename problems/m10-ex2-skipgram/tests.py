sentence = ["我", "每天", "乘坐", "地铁", "上班"]

pairs = generate_skipgram_pairs(sentence, window=2)
assert len(pairs) == 14, f"window=2 应有 14 对，得到 {len(pairs)}"

# "乘坐" 的上下文应该是 {"我","每天","地铁","上班"}
ctx = {c for w, c in pairs if w == "乘坐"}
assert ctx == {"我", "每天", "地铁", "上班"}, f"'乘坐'上下文不对: {ctx}"

# 不应包含自己
for center, context in pairs:
    assert center != context, f"不应含自己: ({center}, {context})"

# window=1
assert len(generate_skipgram_pairs(sentence, 1)) == 8, "window=1 应有 8 对"

# 单词
assert generate_skipgram_pairs(["你好"], 2) == [], "单个词无样本对"

# 两词
assert generate_skipgram_pairs(["我", "走"], 5) == [("我","走"),("走","我")]

print("All tests passed!")
