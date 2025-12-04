# 🏦 BankBot - Backend API
🔗 **Frontend Repository:** [View Frontend Client Code](https://github.com/grandemassone/bank-chatbot-frontend)

The high-performance core of the BankBot system. This API handles secure banking logic, database transactions, and LLM orchestration.

## 🚀 Tech Stack
* **Runtime:** Node.js
* **Framework:** Fastify (Chosen for low overhead and high speed)
* **Database:** PostgreSQL
* **AI Integration:** LLM API (Context-aware responses)
* **Architecture:** Modular REST API (Source folder structure)

## 🧠 AI System Logic
The chatbot utilizes a custom System Prompt designed for the financial sector to ensure:
* **Tone:** Professional, formal, and trustworthy.
* **Constraints:** Strictly answers banking-related queries; refuses off-topic requests.
* **Security:** Prevents generation of fake financial data (hallucinations).

## 🗄️ Database Schema (PostgreSQL)
* **Users:** Secure management of user profiles.
* **Transactions:** Ledger of financial movements.
* **Accounts:** Management of balances and currencies (CHF/EUR).

## 🛠️ How to Run Locally

### Prerequisites
* Node.js (v18+)
* PostgreSQL running locally or via Docker

### Installation
1. Clone the repository:
   ```bash
   git clone [https://github.com/grandemassone/bank-chatbot-backend.git](https://github.com/grandemassone/bank-chatbot-backend.git)
2. Install dependencies:
   ```bash
   npm install
3. Configure Environment Variables: Create a .env file in the root directory:
   ```bash
   DB_HOST=localhost
   DB_USER=your_user
   DB_PASSWORD=your_password
   DB_DATABASE=bankbot
   LLM_API_KEY=your_api_key
4. Start the server:
   ```bash
   npm start
Server running on http://localhost:3000.

### 🐳 Running with Docker
  ```bash
  docker build -t bankbot-backend .
  docker run -p 3000:3000 --env-file .env bankbot-backend
  ```
Developed by Salvador Davide Passarelli during internship at WeBeetle.
