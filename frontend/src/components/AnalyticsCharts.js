import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Activity, Package } from 'lucide-react';
import AccountValueChart from './AccountValueChart';
import InventoryValueChart from './InventoryValueChart';

/**
 * Combined Analytics Charts Component
 * Shows Account Value and Inventory Value charts with a toggle
 * Supports URL parameter ?view=account|inventory for direct navigation
 */
const AnalyticsCharts = ({ defaultView = 'account' }) => {
  const { language } = useLanguage();
  const [searchParams] = useSearchParams();
  
  // Check URL params for direct view selection
  const urlView = searchParams.get('view');
  const initialView = urlView === 'inventory' ? 'inventory' : (urlView === 'account' ? 'account' : defaultView);
  
  const [activeChart, setActiveChart] = useState(initialView);

  // Update view when URL changes
  useEffect(() => {
    if (urlView === 'inventory' || urlView === 'account') {
      setActiveChart(urlView);
    }
  }, [urlView]);

  return (
    <div className="space-y-6">
      {/* Chart Type Toggle */}
      <Tabs value={activeChart} onValueChange={setActiveChart} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-black/30 border border-white/5 h-10">
          <TabsTrigger 
            value="account"
            className="data-[state=active]:bg-primary data-[state=active]:text-black h-full text-sm"
            data-testid="account-chart-tab"
          >
            <Activity className="w-4 h-4 mr-2" />
            {language === 'de' ? 'Kontowert' : 'Account Value'}
          </TabsTrigger>
          <TabsTrigger 
            value="inventory"
            className="data-[state=active]:bg-purple-500 data-[state=active]:text-white h-full text-sm"
            data-testid="inventory-chart-tab"
          >
            <Package className="w-4 h-4 mr-2" />
            {language === 'de' ? 'Inventar-Wert' : 'Inventory Value'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-4">
          <AccountValueChart />
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <InventoryValueChart />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsCharts;
