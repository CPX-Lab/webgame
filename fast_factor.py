#!/usr/bin/env python3
# fast_factor.py
# Classical fast factoring for ~64-bit integers using Miller-Rabin + Pollard-Brent + Pollard p-1.
# Usage:
#   python fast_factor.py 18446457677371445881
# Or just run with no args to use the demo 64-bit N from this session.

import sys, random, math, time

# ---------- Utilities ----------

def gcd(a,b):
    while b:
        a,b=b,a%b
    return abs(a)

def is_probable_prime(n, k=8):
    if n < 2:
        return False
    small_primes = [2,3,5,7,11,13,17,19,23,29]
    for p in small_primes:
        if n%p==0:
            return n==p
    # Miller-Rabin
    d = n-1
    s = 0
    while d % 2 == 0:
        d //= 2
        s += 1
    for _ in range(k):
        a = random.randrange(2, n-2)
        x = pow(a, d, n)
        if x == 1 or x == n-1:
            continue
        skip = False
        for __ in range(s-1):
            x = pow(x, 2, n)
            if x == n-1:
                skip = True
                break
        if skip:
            continue
        return False
    return True

# ---------- Pollard methods ----------

def pollard_pm1(n, B=100000):
    # Stage-1 Pollard p-1 (fast prefilter)
    a = 2
    for j in range(2, B):
        a = pow(a, j, n)
    d = gcd(a-1, n)
    if 1 < d < n:
        return d
    return None

def pollard_brent(n):
    if n % 2 == 0:
        return 2
    if is_probable_prime(n):
        return n
    # Brent's cycle variant of Pollard's rho
    y = random.randrange(1, n-1)
    c = random.randrange(1, n-1)
    m = random.randrange(1, n-1)
    g, r, q = 1, 1, 1
    while g == 1:
        x = y
        for _ in range(r):
            y = (pow(y, 2, n) + c) % n
        k = 0
        while k < r and g == 1:
            ys = y
            for _ in range(min(m, r - k)):
                y = (pow(y, 2, n) + c) % n
                q = (q * abs(x - y)) % n
            g = gcd(q, n)
            k += m
        r <<= 1
    if g == n:
        while True:
            ys = (pow(ys, 2, n) + c) % n
            g = gcd(abs(x - ys), n)
            if g > 1:
                break
    return g

def pollard_rho(n):
    if n % 2 == 0:
        return 2
    if is_probable_prime(n):
        return n
    while True:
        c = random.randrange(1, n-1)
        f = lambda x: (pow(x,2,n)+c)%n
        x = random.randrange(0, n-1)
        y = x
        d = 1
        while d == 1:
            x = f(x)
            y = f(f(y))
            d = gcd(abs(x-y), n)
        if d != n:
            return d

# ---------- Recursive factor ----------

def factor(n, out):
    if n == 1:
        return
    if is_probable_prime(n):
        out.append(n)
        return
    # Quick p-1 prefilter
    d = pollard_pm1(n, 10000)
    if d is None or d == n:
        # Brent usually outperforms vanilla rho
        d = pollard_brent(n)
        if d == n:
            # Very rare fallback
            d = pollard_rho(n)
    factor(d, out)
    factor(n // d, out)

# ---------- Main ----------

def main():
    # Demo 64-bit semiprime from the session:
    demo_p = 4294954943
    demo_q = 4294912967
    demo_N = demo_p * demo_q  # 18446457677371445881 (64 bits)

    if len(sys.argv) >= 2:
        N = int(sys.argv[1])
    else:
        N = demo_N

    t0 = time.time()
    fs = []
    factor(N, fs)
    fs.sort()
    t1 = time.time()

    print(f"N = {N}")
    print(f"bit_length(N) = {N.bit_length()}")
    print(f"factors = {fs}")
    prod = 1
    for f in fs:
        prod *= f
    print(f"check: product = {prod} (ok={prod==N})")
    print(f"time: {(t1-t0)*1000:.2f} ms")

if __name__ == "__main__":
    main()
