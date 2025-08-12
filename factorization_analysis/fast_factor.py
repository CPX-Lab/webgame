#!/usr/bin/env python3
# fast_factor.py
# Classical fast factoring for ~64-bit integers using Miller-Rabin + Pollard-Brent + Pollard p-1.
# Usage:
#   python fast_factor.py 18446457677371445881
# Or just run with no args to use the demo 64-bit N from this session.

import sys, random, math, time
import matplotlib.pyplot as plt
import numpy as np
from sympy import primerange

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

# ---------- Performance Analysis Functions ----------

def generate_sample_primes(min_bits=20, max_bits=32, num_samples=50):
    """Generate sample prime pairs for testing"""
    print(f"Generating {num_samples} prime pairs...")
    
    primes = []
    for bits in range(min_bits, max_bits + 1):
        # Generate primes in different bit ranges
        min_val = 2**(bits-1)
        max_val = 2**bits - 1
        
        # Get primes in this range
        range_primes = list(primerange(min_val, min(max_val, min_val + 1000000)))
        
        if len(range_primes) >= 2:
            # Sample some prime pairs from this range
            samples_per_range = max(1, num_samples // (max_bits - min_bits + 1))
            for _ in range(min(samples_per_range, len(range_primes) // 2)):
                p = random.choice(range_primes)
                q = random.choice(range_primes)
                if p != q:
                    primes.append((p, q, p * q))
    
    # If we don't have enough, generate more
    while len(primes) < num_samples:
        bits = random.randint(min_bits, max_bits)
        min_val = 2**(bits-1)
        max_val = 2**bits - 1
        range_primes = list(primerange(min_val, min(max_val, min_val + 100000)))
        
        if len(range_primes) >= 2:
            p = random.choice(range_primes)
            q = random.choice(range_primes)
            if p != q and (p, q, p * q) not in primes:
                primes.append((p, q, p * q))
    
    return primes[:num_samples]

def test_factorization_performance(prime_pairs, num_trials=3):
    """Test factorization performance on multiple samples"""
    results = []
    
    print(f"Testing factorization on {len(prime_pairs)} samples with {num_trials} trials each...")
    
    for i, (p, q, N) in enumerate(prime_pairs):
        print(f"Testing sample {i+1}/{len(prime_pairs)}: N = {N} ({N.bit_length()} bits)")
        
        times = []
        for trial in range(num_trials):
            t0 = time.time()
            fs = []
            factor(N, fs)
            fs.sort()
            t1 = time.time()
            
            # Verify factorization
            prod = 1
            for f in fs:
                prod *= f
            if prod != N:
                print(f"  WARNING: Factorization failed for N={N}")
                continue
                
            times.append((t1 - t0) * 1000)  # Convert to milliseconds
        
        if times:
            avg_time = np.mean(times)
            std_time = np.std(times)
            results.append({
                'N': N,
                'p': p,
                'q': q,
                'bit_length': N.bit_length(),
                'avg_time_ms': avg_time,
                'std_time_ms': std_time,
                'times': times
            })
    
    return results

def plot_performance_results(results):
    """Plot performance results"""
    if not results:
        print("No results to plot")
        return
    
    # Extract data
    bit_lengths = [r['bit_length'] for r in results]
    avg_times = [r['avg_time_ms'] for r in results]
    std_times = [r['std_time_ms'] for r in results]
    
    # Create figure
    plt.figure(figsize=(12, 8))
    
    # Plot 1: Time vs Bit Length
    plt.subplot(2, 2, 1)
    plt.scatter(bit_lengths, avg_times, alpha=0.6, s=50)
    plt.xlabel('Bit Length of N')
    plt.ylabel('Average Time (ms)')
    plt.title('Factorization Time vs Bit Length')
    plt.grid(True, alpha=0.3)
    
    # Plot 2: Log scale
    plt.subplot(2, 2, 2)
    plt.scatter(bit_lengths, avg_times, alpha=0.6, s=50)
    plt.yscale('log')
    plt.xlabel('Bit Length of N')
    plt.ylabel('Average Time (ms) - Log Scale')
    plt.title('Factorization Time vs Bit Length (Log Scale)')
    plt.grid(True, alpha=0.3)
    
    # Plot 3: Grouped by bit length
    plt.subplot(2, 2, 3)
    bit_groups = {}
    for r in results:
        bl = r['bit_length']
        if bl not in bit_groups:
            bit_groups[bl] = []
        bit_groups[bl].append(r['avg_time_ms'])
    
    bit_lengths_grouped = sorted(bit_groups.keys())
    avg_times_grouped = [np.mean(bit_groups[bl]) for bl in bit_lengths_grouped]
    std_times_grouped = [np.std(bit_groups[bl]) for bl in bit_lengths_grouped]
    
    plt.errorbar(bit_lengths_grouped, avg_times_grouped, yerr=std_times_grouped, 
                marker='o', capsize=5, capthick=2)
    plt.xlabel('Bit Length of N')
    plt.ylabel('Average Time (ms)')
    plt.title('Average Time by Bit Length')
    plt.grid(True, alpha=0.3)
    
    # Plot 4: Performance distribution
    plt.subplot(2, 2, 4)
    plt.hist(avg_times, bins=20, alpha=0.7, edgecolor='black')
    plt.xlabel('Average Time (ms)')
    plt.ylabel('Frequency')
    plt.title('Distribution of Factorization Times')
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('factorization_performance.png', dpi=300, bbox_inches='tight')
    plt.show()
    
    # Print summary statistics
    print("\n" + "="*60)
    print("PERFORMANCE SUMMARY")
    print("="*60)
    print(f"Total samples tested: {len(results)}")
    print(f"Bit length range: {min(bit_lengths)} - {max(bit_lengths)} bits")
    print(f"Average time: {np.mean(avg_times):.2f} ± {np.std(avg_times):.2f} ms")
    print(f"Median time: {np.median(avg_times):.2f} ms")
    print(f"Min time: {min(avg_times):.2f} ms")
    print(f"Max time: {max(avg_times):.2f} ms")
    
    # Performance by bit length
    print("\nPerformance by bit length:")
    for bl in sorted(bit_groups.keys()):
        times = bit_groups[bl]
        print(f"  {bl} bits: {np.mean(times):.2f} ± {np.std(times):.2f} ms (n={len(times)})")

def run_performance_analysis():
    """Run complete performance analysis"""
    print("Starting performance analysis of factorization algorithm...")
    print("="*60)
    
    # Generate sample primes
    prime_pairs = generate_sample_primes(min_bits=20, max_bits=32, num_samples=30)
    
    # Test performance
    results = test_factorization_performance(prime_pairs, num_trials=3)
    
    # Plot results
    plot_performance_results(results)
    
    return results

# ---------- Main ----------

def main():
    # Demo 64-bit semiprime from the session:
    demo_p = 4294954943
    demo_q = 4294912967
    demo_N = demo_p * demo_q  # 18446457677371445881 (64 bits)

    # Generate primes in [x, y]
    primes = list(primerange(1000000000, 1000050000 + 1))

    if len(sys.argv) >= 2:
        if sys.argv[1] == "--performance":
            run_performance_analysis()
            return
        else:
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
