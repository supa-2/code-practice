def generate_skipgram_pairs(sentence, window):
    pairs = []
    for i, center in enumerate(sentence):
        left = max(0, i - window)
        right = min(len(sentence), i + window + 1)
        for j in range(left, right):
            if j != i:
                pairs.append((center, sentence[j]))
    return pairs
