import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  HelpCircle,
  BookOpen,
  TrendingUp,
  Calculator as CalculatorIcon,
  FileText,
  Upload,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronRight,
  Lock,
  MessageCircle
} from 'lucide-react';

type Section =
  | 'dashboard'
  | 'calculator'
  | 'journal'
  | 'import'
  | 'settings'
  | 'concepts'
  | 'faq';

export default function Help() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section') as Section | null;
  const [expandedSection, setExpandedSection] = useState<Section | null>(sectionParam || null);

  const toggleSection = (section: Section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const sections = [
    {
      id: 'dashboard' as Section,
      icon: TrendingUp,
      title: t('help.dashboardHelp'),
      color: 'text-blue-500',
      content: [
        { title: t('help.dashboardTitle'), text: t('help.dashboardContent') },
        { title: t('help.dashboardMetrics'), text: t('help.dashboardMetricsContent'), pre: true }
      ]
    },
    {
      id: 'calculator' as Section,
      icon: CalculatorIcon,
      title: t('help.calculatorHelp'),
      color: 'text-green-500',
      content: [
        { title: t('help.calculatorTitle'), text: t('help.calculatorContent') },
        { title: t('help.calculatorStep1'), text: t('help.calculatorStep1Content'), pre: true },
        { title: t('help.calculatorStep2'), text: t('help.calculatorStep2Content'), pre: true },
        { title: t('help.calculatorStep3'), text: t('help.calculatorStep3Content'), pre: true },
        { title: t('help.calculatorResults'), text: t('help.calculatorResultsContent'), pre: true }
      ]
    },
    {
      id: 'journal' as Section,
      icon: FileText,
      title: t('help.journalHelp'),
      color: 'text-purple-500',
      content: [
        { title: t('help.journalTitle'), text: t('help.journalContent') },
        { title: t('help.creatingTrade'), text: t('help.creatingTradeContent'), pre: true },
        { title: t('help.tradePlanSection'), text: t('help.tradePlanContent'), pre: true },
        { title: t('help.tradeExecutionSection'), text: t('help.tradeExecutionContent'), pre: true },
        { title: t('help.viewingTrades'), text: t('help.viewingTradesContent'), pre: true },
        { title: t('help.filteringTrades'), text: t('help.filteringTradesContent'), pre: true }
      ]
    },
    {
      id: 'import' as Section,
      icon: Upload,
      title: t('help.importHelp'),
      color: 'text-orange-500',
      content: [
        { title: t('help.importTitle'), text: t('help.importContent') },
        { title: t('help.importSteps'), text: t('help.importStepsContent'), pre: true },
        { title: t('help.importLimitations'), text: t('help.importLimitationsContent'), pre: true }
      ]
    },
    {
      id: 'settings' as Section,
      icon: SettingsIcon,
      title: t('help.settingsHelp'),
      color: 'text-gray-500',
      content: [
        { title: t('help.settingsTitle'), text: t('help.settingsContent') },
        { title: t('help.portfolioSettings'), text: t('help.portfolioSettingsContent'), pre: true },
        { title: t('help.backupRestore'), text: t('help.backupRestoreContent'), pre: true },
        { title: t('help.dangerZone'), text: t('help.dangerZoneContent'), pre: true }
      ]
    },
    {
      id: 'concepts' as Section,
      icon: BookOpen,
      title: t('help.conceptsHelp'),
      color: 'text-indigo-500',
      content: [
        { title: t('help.conceptsTitle'), text: t('help.conceptsContent') },
        { title: t('help.whatIs1R'), text: t('help.whatIs1RContent'), pre: true },
        { title: t('help.whatIsRR'), text: t('help.whatIsRRContent'), pre: true },
        { title: t('help.whatIsLeverage'), text: t('help.whatIsLeverageContent'), pre: true },
        { title: t('help.positionSizing'), text: t('help.positionSizingContent'), pre: true },
        { title: t('help.winRate'), text: t('help.winRateContent'), pre: true }
      ]
    },
    {
      id: 'faq' as Section,
      icon: HelpCircle,
      title: t('help.faqSection'),
      color: 'text-pink-500',
      content: [
        { title: t('help.faqQ1'), text: t('help.faqA1') },
        { title: t('help.faqQ2'), text: t('help.faqA2') },
        { title: t('help.faqQ3'), text: t('help.faqA3') },
        { title: t('help.faqQ4'), text: t('help.faqA4') },
        { title: t('help.faqQ5'), text: t('help.faqA5') },
        { title: t('help.faqQ6'), text: t('help.faqA6') },
        { title: t('help.faqQ7'), text: t('help.faqA7') },
        { title: t('help.faqQ8'), text: t('help.faqA8') }
      ]
    }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <HelpCircle className="h-8 w-8 text-primary" />
          {t('help.title')}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t('help.subtitle')}
        </p>
      </div>

      {/* Quick Start */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t('help.gettingStarted')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('help.gettingStartedContent')}</p>
        </CardContent>
      </Card>

      {/* Expandable Sections */}
      <div className="space-y-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const isExpanded = expandedSection === section.id;

          return (
            <Card
              key={section.id}
              className={`cursor-pointer transition-all ${isExpanded ? 'border-primary' : ''}`}
              id={section.id}
            >
              <CardHeader
                className="pb-3"
                onClick={() => toggleSection(section.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${section.color}`} />
                    <CardTitle className="text-lg">{section.title}</CardTitle>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="space-y-6 pt-0">
                  {section.content.map((item, idx) => (
                    <div key={idx} className="space-y-2">
                      <h3 className="font-semibold text-base">{item.title}</h3>
                      {item.pre ? (
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">
                          {item.text}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground">{item.text}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Privacy Note */}
      <Card className="border-green-500/50 bg-green-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <Lock className="h-5 w-5" />
            {t('help.privacyNote')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">
            {t('help.privacyNoteContent')}
          </pre>
        </CardContent>
      </Card>

      {/* Contact & Support */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <MessageCircle className="h-5 w-5" />
            {t('help.contactNote')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">
            {t('help.contactNoteContent')}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
