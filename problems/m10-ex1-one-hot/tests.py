vocab = ["我", "喜欢", "乘坐", "地铁", "公交", "上班"]

# 测试 1: one-hot 基本功能
vec = one_hot("地铁", vocab)
assert vec.shape == (6,), f"shape 错误: {vec.shape}"
assert vec[3] == 1, f"'地铁'应该在 index 3 为 1"
assert vec.sum() == 1, f"one-hot 应该只有一个 1"

# 测试 2: 未知词
assert one_hot("火车", vocab).sum() == 0, "未知词应返回全零"

# 测试 3: 自己和自己
sim_self = cosine_sim(vec, vec)
assert abs(sim_self - 1.0) < 1e-6, f"自相似度应为 1.0，得到 {sim_self}"

# 测试 4: 不同 one-hot
vec2 = one_hot("公交", vocab)
sim_diff = cosine_sim(vec, vec2)
assert abs(sim_diff) < 1e-6, f"不同 one-hot 应正交，得到 {sim_diff}"

# 测试 5: 平行向量
v_a = np.array([1.0, 2.0, 3.0])
v_b = np.array([2.0, 4.0, 6.0])
assert abs(cosine_sim(v_a, v_b) - 1.0) < 1e-6, "平行向量相似度应为 1.0"

print("All tests passed!")
