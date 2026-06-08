vocab = ["猫", "狗", "汽车", "火车", "苹果", "香蕉", "电脑", "手机"]
dim = 10
rng = np.random.RandomState(42)
E = rng.randn(len(vocab), dim)

# 测试 1: lookup
vec = lookup(E, vocab, "汽车")
assert vec.shape == (dim,), f"shape 应为 ({dim},)"
assert np.array_equal(vec, E[2]), "lookup('汽车') 应等于 E[2]"

# 测试 2: 一致性
assert np.array_equal(lookup(E, vocab, "猫"), lookup(E, vocab, "猫"))

# 测试 3: 不排除时找到自己
assert most_similar(E, vocab, E[0], exclude=[]) == "猫"

# 测试 4: 排除自己
best = most_similar(E, vocab, E[0], exclude=["猫"])
assert best != "猫", f"排除后不应返回'猫'，得到 {best}"

# 测试 5: 手动向量验证
E2 = E.copy()
E2[0] = np.array([1.0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0])
E2[1] = np.array([1.1, 0.4, 0, 0, 0, 0, 0, 0, 0, 0])
E2[2] = np.array([0, 0, 1.0, 0.5, 0, 0, 0, 0, 0, 0])
assert most_similar(E2, vocab, E2[0], exclude=["猫"]) == "狗", "最相似应是'狗'"

print("All tests passed!")
