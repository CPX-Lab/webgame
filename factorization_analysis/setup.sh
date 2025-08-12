#!/bin/bash
# Setup script for Factorization Algorithm Analysis

echo "🚀 Setting up Factorization Algorithm Analysis..."
echo "================================================"

# Check if virtual environment exists
if [ ! -d "../.venv" ]; then
    echo "❌ Virtual environment not found. Please create one first:"
    echo "   python3 -m venv .venv"
    echo "   source .venv/bin/activate"
    exit 1
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source ../.venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Quick start commands:"
echo "   python fast_factor.py --performance     # Run performance analysis"
echo "   python benchmark_comparison.py          # Compare with SymPy"
echo "   python visualization_comparison.py      # Generate visualizations"
echo "   python performance_insights.py          # Get insights"
echo "   python simple_performance_plot.py       # Text-based plots"
echo ""
echo "📖 For detailed information, see README.md"
