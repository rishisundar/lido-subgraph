#Run the Script as admin
#Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
#Reset bash
source ~/.bashrc
#Install node v18.12.1
nvm install v18.12.1
#Upgrade npm
npm install -g npm@9.1.2
#Install Yarn
npm install --global yarn
#Install and setup docker and docker-compose
sudo apt install apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
apt-cache policy docker-ce
sudo apt install docker-ce
mkdir -p ~/.docker/cli-plugins/
curl -SL https://github.com/docker/compose/releases/download/v2.12.2/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose
docker compose version
apt install docker-compose
systemctl status docker

#Install Graph-CLI
yarn global add @graphprotocol/graph-cli

#Clone the repos
git clone https://github.com/rishisundar/lido-subgraph.git
git clone https://github.com/rishisundar/graph-node.git
cd ./graph-node
yarn
cd ..
cd ./lido-subgraph
yarn
chmod +x ./deploySubgraph.sh
cp .env.local.example .env
cd ..
cd ./graph-node/docker/
chmod +x ./startNode.sh

#Creating and deploying the subgraph
yarn codegen
yarn build
yarn remove-local
yarn create-local
yarn deploy-local
